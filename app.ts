//Ground Control

console.log('working');

import https from 'https';
import { taAPIresponse, IndicatorSettings, IndicatorValueResponse_MACD } from './interfaces';
import { apiKey, coinPairs, intervals, percentageTolerance, waitInterval } from './settings.json';

//WEBSOCKET

const ws = require('ws');
const createServer = require('http').createServer;
const WebSocketServer = ws.WebSocketServer;

const port = process.env.PORT || 6969;
console.log(port);
const password = process.env.AUTHKEY || 'cockandballs';

let dies: diesDT[] = [];

const life = 0.5 * 60 * 1000;

const server = createServer();
const wss = new WebSocketServer({ noServer: true });

interface diesDT {
	id: number,
	dieTime: number
}

function findWSIndex(id: number): number {
	return dies.findIndex((die) => {
		if(die.id === id)
			return true;
	})
}

let newId = -1;

wss.on('connection', function connection(ws: any, request: any, client: any) {
	newId++;
	let id = newId;
	const dieTime = Date.now() + life;
	dies.push(
		{
			id,
			dieTime
		}
	);

	ws.on('message', function message(msg: any) {
		let message;
		try {
			message = JSON.parse(msg);
		} catch(e) {
			sendMessage(id, 'invalidJSON', `'${msg}' is not valid stringified JSON`);
		}

		if(message) {
			console.log(`Received event: '${message.event}' and message: '${message.message}' from Major Tom`);
			if(message.event == 'ping') {
				sendMessage(id, 'pong');
				dies[ findWSIndex(id) ].dieTime = Date.now() + life; //update die time
			}
		}
	});
  
	ws.send(
		JSON.stringify(
			{
				event: 'Greetings',
				message: 'Ground Control to Major Tom'
			}
		)
	)
});

server.on('upgrade', function upgrade(request: any, socket: any, head: any) {
  // This function is not defined on purpose. Implement it with your own logic.
	if(request.headers.authorization !== password) {
		socket.write('u suck');
		console.log('Hackers');
		socket.destroy();
	}

    wss.handleUpgrade(request as any, socket as any, head as any, function done(ws: any) {
      wss.emit('connection', ws as any, request as any);
    });
});
	
server.listen(port);
console.log(`listening on port: ${port}`)

setInterval(() => {
	dies.forEach(ws => {
		if( ws.dieTime < Date.now() ) {
			sendMessage(ws.id as number, 'die', 'kys');
		}
	});
	wss.clients.forEach( (ws: any) => ws.send(`{"event": "pong"}`));
}, life);

function sendMessage(id: number, event: string, message?: string)  {
	//send to all (use it for when to send triggers)
	if(id === -1) {
		if(event === 'die') {
			wss.clients.forEach( (client: any) => {
				client.close();
			});
		} else {
			wss.clients.forEach( (client: any) => {
				client.send(JSON.stringify({
					event,
					message
				}))
			});
		}
	} else {
		//send to specific client, used for pong request
		let ia = -1;
		const WSIndex = findWSIndex(id);
		if(event === 'die') {
			wss.clients.forEach( (client: any) => {
				ia++;
				if(ia == WSIndex) {
					client.close();
				}
				dies.splice(WSIndex, 1);
			});
		} else {
			wss.clients.forEach( (client: any) => {
				ia++;
				if(ia == WSIndex) {
					client.send(JSON.stringify({
						event,
						message
					}))
				}
			});
		}
	}
}

//END WEBSOCKET

// Functions

async function Sleep(ms: number = 1000): Promise<void> {
	return await new Promise(resolve => setTimeout(resolve, ms));	
}

function inPercentageRange(number: number, comparedNumber: number, percentage: number): boolean {
	const min = comparedNumber * (1 - percentage / 100);
	const max = comparedNumber * (percentage / 100 + 1);

	return (number - min) * (number - max) <= 0;
}

function parseReturnMSG(coinPair: string, interval: string, indicator: string, overMsg?: string): string {
	return indicators[indicator].triggerMSG
			.replace('{COINPAIR}', coinPair)
			.replace('{INTERVAL}', interval)
			.replace('{MOMENTUMSTAT}', overMsg);
}


async function getIndicatorValues(settings): Promise<taAPIresponse> {
	try {
		const payload: string = JSON.stringify(settings);

		const options = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': payload.length,
				'Accept': 'application/json'
			},
		};


		const response = await new Promise(resolve => {
			const req = https.request('https://api.taapi.io/bulk', options, response => {
				if (response.statusCode != 200) {
					console.log(`Failed to POST to "https://api.taapi.io/bulk": ${response.statusMessage} (${response.statusCode})`);
					resolve(null);
				}

				const body: Buffer[] = [];

				response.on('data', chunk => body.push(chunk));
				response.on('end', () => resolve( Buffer.concat(body).toString() ));
			});
		
			req.on('error', () => resolve(null));
		
			req.on('timeout', () => {
				req.destroy();
				resolve(null);
			});
	
			req.write(payload);
			req.end();
		}) as string;


		return JSON.parse(response)?.data || null;
	} catch (e) {
		console.log(`Failed to POST to "https://api.taapi.io/bulk": (${e.message})`);
	}

	return null;
}


// Indicators

const indicators: IndicatorSettings = {
	EMA50: {
		name: '50 EMA',
		triggerMSG: '{COINPAIR} is approaching 50 EMA ({INTERVAL}).'
	},
	EMA200: {
		name: '200 EMA',
		triggerMSG: '{COINPAIR} is approaching 200 EMA ({INTERVAL}).'
	},
	RSI10: {
		name: 'RSI(10)',
		triggerMSG: '{COINPAIR} is {MOMENTUMSTAT} on RSI ({INTERVAL}).'
	},
	VWAP: {
		name: 'VWAP',
		triggerMSG: '{COINPAIR} is approaching VWAP.'
	},
	MACD: {
		name: 'MACD',
		triggerMSG: 'MACD {MOMENTUMSTAT} signal line on {COINPAIR} ({INTERVAL})' 
	}
} as const;


// Main

const coinPairIndicatorValues = Object.fromEntries( coinPairs.map(coinPair => [coinPair, undefined]) );
const prevIndicatorValues: any = Object.fromEntries( intervals.map(interval => [interval,  coinPairIndicatorValues]) );


async function main() {
	const triggered: string[] = [];


	for (const coinPair of coinPairs) {

		for (const interval of intervals) {
			// Fetch data from API

			const payload = {
				secret: apiKey,
				construct: {
					exchange: 'binance',
					symbol: coinPair,
					interval,
					indicators: [
						{
							indicator: 'candle',
							id: 'LASTPRICE'
						},
						{
							indicator: 'ema',
							id: 'EMA50',
							optInTimePeriod: 50
						},
						{
							indicator: 'ema',
							id: 'EMA200',
							optInTimePeriod: 200
						},
						{
							indicator: 'rsi',
							id: 'RSI10',
							optInTimePeriod: 10
						},
						{
							indicator: 'vwap',
							id: 'VWAP',
							anchorPeriod: 'session'
						},
						{
							indicator: 'macd',
							id: 'MACD',
							optInSlowPeriod: 26,
							optInFastPeriod: 12
						},
						{
							indicator: 'macd',
							id: 'MACD_PREV',
							optInSlowPeriod: 26,
							optInFastPeriod: 12,
							backtrack: 1
						}
					]
				}
			};

			const response = await getIndicatorValues(payload);
			if (!response) continue;

			// Check if any indicators are producing a signal

			const coinPrice = response[0].result.close;

			for (let i = 1; i < response.length; i++) {
				const { id: indicator, result } = response[i];
				const prevTrigger = prevIndicatorValues[i - 1];


				// 50 EMA, 200 EMA and VWAP
				if (i == 1 || i == 2 || i == 4) {
					const isTrigger = inPercentageRange((result as any).value, coinPrice,  i != 4 ? percentageTolerance : 1);
					if (prevTrigger == isTrigger) continue;


					if (isTrigger) {
						prevIndicatorValues[interval][indicator] = true;

						const msg = parseReturnMSG(coinPair, interval, indicator);
						triggered.push(msg);
					}

					else prevIndicatorValues[interval][indicator] = false;
				}


				// RSI
				if (i == 3) {
					const momentum = (result as any).value <= 30 ? 'OVERSOLD' : (result as any).value >= 70 ? 'OVERBOUGHT': null;
					if (prevTrigger == momentum) continue;

					prevIndicatorValues[interval][indicator] = momentum;

					if (momentum) {
						const msg = parseReturnMSG(coinPair, interval, indicator, momentum.toLowerCase());
						triggered.push(msg);
					}
				}


				// MACD
				if (i == 5) {
					const histogram = response[i].result.valueMACDHist;
					const prevHistogram = (response[i + 1] as IndicatorValueResponse_MACD).result.valueMACDHist;

					const momentum = histogram < 0 && prevHistogram > 0 ? 'CROSSED OVER' : histogram > 0 && prevHistogram < 0 ? 'CROSSED UNDER' : null;
					if (prevTrigger == momentum) continue;

					prevIndicatorValues[interval][indicator] = momentum;

					if(momentum) {
						const msg = parseReturnMSG(coinPair, interval, indicator, momentum.toLowerCase());
						triggered.push(msg);
					}
				}
			}


			await Sleep(waitInterval);
		}

	}


	// Alerts

	// if (triggered.length) console.log(Date.now(), '\n', triggered, '\n');

	console.log(prevIndicatorValues);
	sendMessage(-1, 'Trigger Messages', triggered.toString());
	console.log(Date.now(), '\n', triggered, '\n');
}



console.log(`Settings:\n==================================\nCoinpairs: ${coinPairs.join(', ')}\nPercentage Tolerance: ${percentageTolerance}%,\nIntervals: ${intervals.join(', ')}\nPass: '${password}'\nEstimated runtime: ${(coinPairs.length * waitInterval * intervals.length) / 1000} seconds\n==================================\n\n`);

main();
setInterval(main, 10 * 60 * 1000); //every 10 min
import https from 'https';
import { taAPIresponse, IndicatorSettings, IndicatorValueResponse_MACD } from './interfaces';
import { apiKey, coinPairs, intervals, percentageTolerance, waitInterval } from './settings.json';

//Websocket
//EXPRESS HTTP

const express = require('express');
const PORT = process.env.PORT || 3000;
const INDEX = '/';

const server = express()
  .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

//create websocket
const { Server } = require('ws');

const wss = new Server({ server });

//Handle connections

wss.on('connection', (ws) => {
	console.log('Client connected');
	ws.on('close', () => console.log('Client disconnected'));
  });

//send data
  setInterval(() => {
	wss.clients.forEach((client) => {
	  client.send(new Date().toTimeString());
	});
  }, 1000);
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

const indicatorPrevIndicatorValues = Object.fromEntries( Object.keys(indicators).map(indicator => ([indicator, undefined])) );
const coinPairIndicatorValues = Object.fromEntries( coinPairs.map(coinPair => [coinPair, indicatorPrevIndicatorValues]) );
const prevIndicatorValues = Object.fromEntries( intervals.map(interval => [interval,  coinPairIndicatorValues]) );



async function main(socket) {
	console.log('STARTING')
	socket.write('FUCKFUCKFUCK');
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

			console.log('requesting...')
			const response = await getIndicatorValues(payload);
			console.log('recieved...')
			if (!response) continue;


			// Check if any indicators are producing a signal

			const coinPrice = response[0].result.close;

			for (let i = 1; i < response.length; i++) {
				const { id: indicator, result } = response[i];
				const prevTrigger = prevIndicatorValues[interval][coinPair][indicator];


				// 50 EMA, 200 EMA and VWAP
				if (i == 1 || i == 2 || i == 4) {
					const isTrigger = inPercentageRange((result as any).value, coinPrice,  i != 4 ? percentageTolerance : 1);
					if (prevTrigger == isTrigger) continue;


					if (isTrigger) {
						prevIndicatorValues[interval][coinPair][indicator] = true;

						const msg = parseReturnMSG(coinPair, interval, indicator);
						triggered.push(msg);
					}

					else prevIndicatorValues[interval][coinPair][indicator] = false;
				}


				// RSI
				if (i == 3) {
						const momentum = (result as any).value <= 30 ? 'OVERSOLD' : (result as any).value >= 70 ? 'OVERBOUGHT': null;
					if (prevTrigger == momentum) continue;

					prevIndicatorValues[interval][coinPair][indicator] = momentum;

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

					prevIndicatorValues[interval][coinPair][indicator] = momentum;

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
	console.log(Date.now(), '\n', triggered, '\n');	
	socket.write(JSON.stringify({ 'triggers': triggered, 'time': Date.now() }));
}



console.log(`Settings:\n==================================\nCoinpairs: ${coinPairs.join(', ')}\nPercentage Tolerance: ${percentageTolerance}%,\nIntervals: ${intervals.join(', ')}\nEstimated runtime: ${(coinPairs.length * waitInterval * intervals.length) / 1000} seconds\n==================================\n\n`);

// main();
// setInterval(main, 10000);
import axios, { Method, AxiosRequestConfig } from 'axios';

const io = require("socket.io")({
	path: "/test",
	serveClient: false,
});

const http = require('http');
const WebSocketServer = require('websocket').server;

const server = http.createServer();
server.listen(8008);

const wsServer = new WebSocketServer({
    httpServer: server
});

wsServer.on('request', function(request) {
    const connection = request.accept(null, request.origin);

    connection.on('message', function(message) {
      console.log('Received Message:', message.utf8Data);
      connection.sendUTF('Hi this is WebSocket server!');
    });
    connection.on('close', function(reasonCode, description) {
        console.log('Client has disconnected.');
    });
});


const APIKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImRvbmFsZGVyb2JlcnRzQGdtYWlsLmNvbSIsImlhdCI6MTYzMDc3OTg1NywiZXhwIjo3OTM3OTc5ODU3fQ.j19Lva4FcUGvuEgDLglb2jj15wtrozz0afd5SprLjE4';
// const APIKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6IkVyaWtAQm91ZG1hbi5jb20iLCJpYXQiOjE2MzExODI0MTksImV4cCI6NzkzODM4MjQxOX0._1hN88NklhnvbctT0Tfro1jcSKsQE14HWRQcdh0SUJ0';//Eriks Key

// Functions

async function Sleep(ms: number = 1000): Promise<void> {
	return await new Promise(resolve => setTimeout(resolve, ms));	
}

function inPercentageRange(number: number, comparedNumber: number, percentage: number): boolean {
	const min = comparedNumber * (1 - percentage / 100);
	const max = comparedNumber * (percentage / 100 + 1);

	return (number - min) * (number - max) <= 0;
}

function abvOrBelowMACD(newSlow: number, newFast: number, oldSlow: number, oldFast: number) :boolean | null {
	const anyAction = ( ( ( newSlow - newFast ) > 0 ) == ( ( oldSlow - oldFast ) < 0 ) ); //true = they crossed, false = no cross
	if(!anyAction) return null;

	const didSlowCross = oldSlow > (newSlow && oldFast) && newSlow < newFast;
	return didSlowCross; //if true: Slow crossed under fast, if false: slow went above fast'
}

async function sendHTTPrequest(url: string, method: Method = 'GET'||'POST', headers?: Object, payload?: any) {
	try {
		const axiosParams: AxiosRequestConfig = { method, url };

		if (headers) axiosParams.headers = headers;
		if (payload) axiosParams.data = payload;

		const returned = await axios.request(axiosParams);

		return returned?.status == 200 ? returned.data : null;
	} catch (e:any) {
		console.log(`Failed to ${method.toUpperCase()} "${url}"`, e.response?.status);
		console.log(e.response?.data);
	}
	return null;
}


// Constants 

const coinPairs = ['BTC/USDT', 'ETH/USDT', 'LTC/USDT', 'ADA/USDT', 'XRP/USDT', 'BNB/USDT', 'LINK/USDT', 'DOGE/USDT', 'DOT/USDT', 'CAKE/USDT', 'AAVE/USDT', 'SOL/USDT'] as const;
const intervals : string[] = ['4h','1d'];
const indicators: {[key: string]: any} = {
	EMA50: {
		name: '50 EMA',
		url: 'https://api.taapi.io/ema?exchange=binance&symbol={COINPAIR}&interval={INTERVAL}&optInTimePeriod=50&secret={APIKEY}',
		triggerMsg: '{COINPAIR} Is approaching 50 EMA ({INTERVAL}).'
	},
	EMA200: {
		name: '200 EMA',
		url: 'https://api.taapi.io/ema?exchange=binance&symbol={COINPAIR}&interval={INTERVAL}&optInTimePeriod=200&secret={APIKEY}',
		triggerMsg: '{COINPAIR} Is approaching 200 EMA ({INTERVAL}).'
	},
	RSI10: {
		name: 'RSI(10)',
		url: 'https://api.taapi.io/rsi?exchange=binance&symbol={COINPAIR}&interval={INTERVAL}&optInTimePeriod=10&secret={APIKEY}',
		triggerMsg: '{COINPAIR} Is {MOMENTUMSTAT} on RSI ({INTERVAL}).'
	},
	VWAP: {
		name: 'VWAP',
		url: 'https://api.taapi.io/vwap?exchange=binance&symbol={COINPAIR}&interval={INTERVAL}&anchorPeriod=session&secret={APIKEY}',
		triggerMsg: '{COINPAIR} Is approaching VWAP.'
	},
	MACD: {
		name: 'MACD',
		triggerMsg: 'MACD {MOMENTUMSTAT} signal line on {COINPAIR} ({INTERVAL})' 
	}
} as const;

const percentageTolerance = 1.5;

console.log(`Constants:  -----\n Coins: ${coinPairs.join(', ')} \n Percentage Tolerance: ${percentageTolerance}, Intervals: ${intervals.join(', ')}`);

// Indicator states

interface macdDT {
	id: string;
	result: {
		valueMACD: number, 
		valueMACDSignal: number,
		valueMACDHist: number,
	};
	errors?: string[];
	trigger?: boolean | 'CROSSED UNDER' | 'CROSSED OVER';
}

interface IndicatorValue {
	id: string;
	result: {
		value?: number,
		valueMACD?: number, 
		valueMACDSignal?: number,
		valueMACDHist?: number,
	};
	errors?: string[];
	trigger?: boolean | 'OVERSOLD' | 'OVERBOUGHT' | 'CROSSED UNDER' | 'CROSSED OVER';
}

let prevIndicatorValues: IndicatorValue[] = [
	{
		id: 'BTC/USDT 4H RSI 64312',
		result: {},
		trigger: false
	}
];

function findOldTriggerState(coinName: string, coinIndicator: string) {
	prevIndicatorValues.forEach(prev => {
		if(prev.id.includes(coinName) && prev.id.includes(coinIndicator)) {
			return prev.trigger;
		}
	});
	return false;
}

function parseReturnMsg (coinName: string, interval: string, indicator: string = '', overMsg?: string) {
	return indicators[indicator].triggerMsg.replace('{COINPAIR}', coinName).replace('{INTERVAL}', interval).replace('{MOMENTUMSTAT}', overMsg);
}

// Main

const waitInterval = 16000;

let indicatorValues: IndicatorValue[] = [];
let triggered: string[] = [];

async function main2() {
	// setInterval(async () => {
		for (let ia = 0; ia < coinPairs.length; ia++) {
			const coinPair = coinPairs[ia];
			for (let ib = 0; ib < intervals.length; ib++) {
				const interval = intervals[ib];

				const coinInfo = await sendHTTPrequest(`https://api.taapi.io/candle?secret=${APIKEY}&exchange=binance&symbol=${coinPair}&interval=1h`,'GET');
				const coinPrice = Number(coinInfo.close);

				const toSend = {
					"secret": APIKEY,
					"construct": {
						"exchange": "binance",
						"symbol": coinPair,
						"interval": interval,
						"indicators": [
							{
								// Relative Strength Index
								"indicator": "rsi",
								"id": `${coinPair} ${interval} RSI10 ${coinPrice}`
							},
							{
								// Exponential Moving Average 50
								"indicator": "ema",
								"optInTimePeriod": 50,
								"id": `${coinPair} ${interval} EMA50 ${coinPrice}`
							},
							{
								// Exponential Moving Average 200
								"indicator": "ema",
								"optInTimePeriod": 200,
								"id": `${coinPair} ${interval} EMA200 ${coinPrice}`
							},
							{
								//MACD
								"indicator": "macd",
								"optInSlowPeriod": 26,
								"optInFastPeriod": 12,
								"id": `${coinPair} ${interval} MACDNow ${coinPrice}` //Id is used so when it returns the data, we can access this data using ID
							},
							{
								//MACD
								"indicator": "macd",
								"backtrack": 1,
								"optInSlowPeriod": 26,
								"optInFastPeriod": 12,
								"id": `${coinPair} ${interval} MACDBack ${coinPrice}`
							}
						]
					}
				} as const;
				
				// Fetch indicator values
				console.log(`${coinPair} ${interval} Requesting...`);

				const newIndicator:any = await sendHTTPrequest('https://api.taapi.io/bulk', 'POST', toSend, toSend);
				
				console.log(`${coinPair} Success (${interval})`);
				
				Object.keys(newIndicator.data).forEach(key => {
					indicatorValues.push(newIndicator.data[key]);
				});
				await Sleep(waitInterval);
			}
		}

		let i = -1;
		indicatorValues.forEach(indicatorValue => {
			i++;
			const coinSplit = indicatorValue.id.split(' ');
			const coinPrice = Number(coinSplit[coinSplit.length-1]);
			const coinPair = coinSplit[0];
			const coinInterval = coinSplit[1];
			const coinIndicator = coinSplit[2] as 'EMA50' | 'EMA200' | 'RSI10' | 'MACD' | 'VWAP';

			const oldTrigger = findOldTriggerState(coinPair, coinIndicator);

			if(oldTrigger === (true || 'oversold' || 'overbought')) return;

			const timestamp = Date.now();

			if (indicatorValue.id.includes('EMA')) { //if it is ema 50 or ema 200
				const indicatorEMA = indicatorValue.result.value;
				if(indicatorEMA) {
					const isTrigger = inPercentageRange(indicatorEMA, coinPrice, percentageTolerance);
					indicatorValue.trigger = false;
					
					if (isTrigger) {
						indicatorValue.trigger = true;

						triggered.push(parseReturnMsg(coinPair, coinInterval, coinIndicator));
					} else prevIndicatorValues[i].trigger = false;
				}
			}

			if (indicatorValue.id.includes('RSI')) { // RSI
				if(indicatorValue.result.value) {
					const oversold = indicatorValue.result.value <= 30;
					const overbought = indicatorValue.result.value >= 70;

					prevIndicatorValues[i].trigger = false;
					const isTrigger = oversold == true || overbought == true;
					if (isTrigger) {
						const overMsg = oversold? 'OVERSOLD' : 'OVERBOUGHT';
						indicatorValues[i].trigger = overMsg;
						triggered.push( parseReturnMsg(coinPair, coinInterval, coinIndicator, overMsg));
					}
				}
			}

			if (indicatorValue.id.includes('VWAP')) { //VWAP
				const vwap = indicatorValue.result.value;
				if(vwap) {
					const percentageDifference = (1 - vwap / coinPrice) * 100;

					const isTrigger = inPercentageRange(percentageDifference, coinPrice, percentageTolerance);
					indicatorValues[i].trigger = false;
					if (oldTrigger === false) {
						indicatorValues[i].trigger = true;
						triggered.push( parseReturnMsg(coinPair, coinInterval, coinIndicator) );
					}
				}
			}

			if (indicatorValue.id.includes('MACDNow')) { //MACD
				const histogram = (indicatorValue as macdDT).result.valueMACDHist;
				const prevHistogram = (indicatorValues[i+1] as macdDT).result.valueMACDHist;

				let bullish;
				if( histogram < 0 && prevHistogram > 0) {
					bullish = true;
				} else if(histogram > 0 && prevHistogram < 0) {
					bullish = false;
				}

				if( bullish !== undefined ) {
					const msg = bullish?'CROSSED OVER':'CROSSED UNDER';
					indicatorValue.trigger = msg;
					triggered.push( parseReturnMsg( coinPair, coinInterval, 'MACD', msg.toLowerCase() ) );
				}

			}

			prevIndicatorValues = indicatorValues; 
			if(triggered.length > 0) {
				console.log(Date.now());
				console.log(triggered);
				console.log('');
			}
		});
	
	// }, 10*60*1000);
}


main2();
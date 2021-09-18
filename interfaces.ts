interface IndicatorSetting {
	name: string;
	triggerMSG: string;
}

interface IndicatorSettings {
	EMA50: IndicatorSetting;
	EMA200: IndicatorSetting;
	RSI10: IndicatorSetting;
	VWAP: IndicatorSetting;
	MACD: IndicatorSetting;
}


interface IndicatorValueResponse {
	id: string;
	result: {
		value: number;
	};
	errors: string[];
	trigger: boolean;
}

interface IndicatorValueResponse_Candle {
	id: string;
	result: {
		timestampHuman: string;
		timestamp: number;
		open: number;
		high: number;
		low: number;
		close: number;
		volume: number;
	};
	errors: string[];
	trigger: boolean;
}

interface IndicatorValueResponse_RSI {
	id: string;
	result: {
		value: number;
	};
	errors?: string[];
	trigger: 'OVERSOLD' | 'OVERBOUGHT' | null;
}

interface IndicatorValueResponse_MACD {
	id: string;
	result: {
		valueMACD: number;
		valueMACDSignal: number;
		valueMACDHist: number;
	};
	errors: string[];
	trigger: 'CROSSED UNDER' | 'CROSSED OVER' | null;
}


type IndicatorValues = {
	[interval: string]: {
		[coinPair: string]: string[];
	}
};


type taAPIresponse = [
	IndicatorValueResponse_Candle,
	IndicatorValueResponse,
	IndicatorValueResponse,
	IndicatorValueResponse,
	IndicatorValueResponse,
	IndicatorValueResponse_MACD,
	IndicatorValueResponse_MACD
];


export { IndicatorSettings, IndicatorValueResponse, IndicatorValueResponse_Candle, IndicatorValueResponse_RSI, IndicatorValueResponse_MACD, taAPIresponse, IndicatorValues };
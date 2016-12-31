var argv = require('optimist').argv;
var moment = require('moment');
var http = require('http');
var fs = require('fs');
var KrakenClient = require('./kraken-api');
var kraken = new KrakenClient('', '');
var util = require('util');

var log_file = fs.createWriteStream(__dirname + '/console.log', {flags : 'w'});
var log_stdout = process.stdout;
console.log = function(d) { 
  log_file.write(util.format(d) + '\n');
  log_stdout.write(util.format(d) + '\n');
};

//chart data
var MApoints = []; 
var EMApoints = [];
var chartLabel = []; 
var labelLog   = ''; 
var profit = 0.0;
var hysteresis = 6.50; //for 30 days  MA a 3 days EMA the most optimized value is 6,5
var trade = false;

var btc_budget = 0.0;
var euro_budget = 0.0;

var ticker_id = 0;


function getMA_EMA(since, interval, count, ema_count, all_done) {
	// Reset variables
	MApoints = []; 
	EMApoints = [];
	chartLabel = []; 
	labelLog   = ''; 

	var ema_since = since,
		ma_since = since - (count-1) * interval * 60;
//get OHLC data
	kraken.api('OHLC', {"pair": 'XBTCZEUR', "interval": interval, "since": ma_since}, function(error, data) {
		console.log(' ');
	    console.log('Get moving average...');
		console.log("since time: " + since);
	    
		if(error) {
	        console.log(error);
	    }
	    else {
			var sumDone = false;
			for(var i=0;i<data.result.XXBTZEUR.length;i++) {
				var sum = 0.0;
				for(var k=i;((i-count) >= -1)&&(k>(i-count));k--)
				{
					sum = sum + parseFloat(data.result.XXBTZEUR[k][4]); //closed price
					sumDone = true;
				}
				if (sumDone) {
					sumDone = false;
					var value = sum / count;
					MApoints.push(value.toFixed(2));
					chartLabel.push(i - (count-1));
				}
			}
			console.log('MA loaded');
			console.log('length of array: ' + MApoints.length);
			getEMA(ema_since,interval,ema_count, MApoints[0], all_done);
		}
	});
}

function getEMA(since, interval, count, prevEMAval, all_done) {
//get OHLC data
	kraken.api('OHLC', {"pair": 'XBTCZEUR', "interval": interval, "since": since}, function(error, data) {
		console.log(' ');
	    console.log('Get exponential moving average...');
		console.log("since time: " + since);
		 
	    if(error) {
	        console.log(error);
	    }
	    else {
			var ema = prevEMAval;
			var alfa = parseFloat(2/(1+count));
			
			for(var i=0;i<data.result.XXBTZEUR.length;i++) {
				ema = (parseFloat(data.result.XXBTZEUR[i][4]) * alfa) + (ema * (1-alfa));
				EMApoints.push(ema.toFixed(2));
			}
			console.log('EMA loaded');
			console.log('length of array: ' + EMApoints.length);
			if(!trade) {
				//simulation
				getProfit(all_done);			
			} else {
				//real tradeing
				all_done();
			}
	    }
	});
}

function getProfit(all_done) {
		
	profit = 0.0;
	
	var buySell = false;
	var last_buy_price = parseFloat(MApoints[0]);
	
	var btc_zero = false;
	if(isNaN(btc_budget)) {
		btc_budget = 0.0;
		btc_zero = true;
	}
	
	if(isNaN(euro_budget)) {
		if(btc_zero) euro_budget = 1000.0;
		else euro_budget = 0.0;
	}

	var input = euro_budget + btc_budget * EMApoints[0];
	console.log(' ');
	console.log(' €€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ ');
	console.log(' ');
	console.log('-----------------------------------------------------------');
	console.log(' ');
	console.log('BTC budget ' + btc_budget.toFixed(2));
	console.log('€ budget ' + euro_budget.toFixed(2));
	console.log(' ');
	console.log('-----------------------------------------------------------');
	console.log(' ');
	console.log('Calculate profit...');
	console.log(' ');
	
	if(EMApoints[0] >= MApoints[0]) buySell = true;
	
	//calculate profit
	for(var i = 0; i < MApoints.length; i++) {
		if ((!buySell) && (EMApoints[i] > (MApoints[i] + hysteresis))) {
			//buy bitcoin
			buySell = true;
			if (euro_budget > 0.0) {
				last_buy_price = EMApoints[i];
				btc_budget = euro_budget / last_buy_price;
				profit = profit - euro_budget;
				euro_budget = 0.0;
				
				console.log('Buying BTC...');
				console.log('BTC budget ' + btc_budget.toFixed(2) + 'BTC');
				console.log('EURO budget ' + euro_budget.toFixed(2) + '€');
				console.log('Bought ' + btc_budget.toFixed(2) + 'BTC, price = ' + last_buy_price + '€, data: x = ' + i);
				console.log(' ');
			}
		} else if ((buySell) && (EMApoints[i] <= (MApoints[i] - hysteresis))) {
			//sell bitcoin
			buySell = false;
			if (btc_budget > 0.0) {
				euro_budget = btc_budget * EMApoints[i]; 
				var delta = (EMApoints[i] - last_buy_price);
				profit = profit + delta;
				
				console.log('Selling BTC...');
				console.log('BTC budget ' + btc_budget.toFixed(2) + 'BTC');
				console.log('EURO budget ' + euro_budget.toFixed(2) + '€');
				console.log('Sold ' + btc_budget.toFixed(2) + 'BTC, price = ' + EMApoints[i] + '€, profit value ' + delta.toFixed(2) + '€, data: x = ' + i);
				console.log(' ');
				btc_budget = 0.0;
			}
		}
	}
	var output = btc_budget * EMApoints[EMApoints.length - 1] + euro_budget;
	profit = output - input;
	labelLog = 'Input = ' + input.toFixed(2) + '€, Output = ' + output.toFixed(2) + '€, Profit = ' + profit.toFixed(2) + "€";
	console.log('-----------------------------------------------------------');
	console.log(labelLog);
	console.log('-----------------------------------------------------------');
	console.log(' ');
	console.log('Open chrome browser and copy paste this address there:');
	console.log('http://127.0.0.1:8888');
	console.log(' ');
	console.log('Enjoy :) ');
	console.log(' €€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ ');
	console.log(' ');
	all_done();
}


function Get_My_Balances(balances_data)
{
	// Display user's balance
	kraken.api('Balance', null, function(error, data) {
		console.log(' ');
	    console.log('ACCOUNT BALANCE');
	    if(error) {
	        console.log(error);
	        console.log(' ');
	    }
	    else {
	    	var xxbt = data.result.XXBT,
				zeur = data.result.ZEUR;
	    	console.log('bitcoins: ' + xxbt);
	    	console.log('euros: ' + zeur);
	    	console.log(' ');
			balances_data(xxbt, zeur);
	    }
	});
}


function Get_Tickeer(ticker_data){
	// Get Ticker Info
	kraken.api('Ticker', {"pair": 'XBTCZEUR'}, function(error, data) {
	    if(error) {
	        console.log(error);
	    }
	    else {
	        console.log(' ');
	        console.log('ID: ' + ticker_id);
	        console.log(' ');
			console.log(getDateTime());
			console.log(' ');

	        var ask_price = parseFloat(data.result.XXBTZEUR.a[0]),
				bid_price = parseFloat(data.result.XXBTZEUR.b[0]),
				ask_volume = parseFloat(data.result.XXBTZEUR.a[1]),
				bid_volume = parseFloat(data.result.XXBTZEUR.b[1]);
        	console.log('Buy bitcoin - ask');
        	console.log('price: ' + ask_price + ' euro');
        	console.log('volume: ' + ask_volume);
	        console.log(' ');
	        console.log('Sell bitcoin - bid');
	        console.log('price: ' + bid_price + ' euro');
	        console.log('volume: ' + bid_volume);
	        console.log(' ');
			ticker_data(ask_price, ask_volume, bid_price, bid_volume);
		}
	});
}


function getDateTime() {
    var date = new Date();
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var minute  = date.getMinutes();
    minute = (minute < 10 ? "0" : "") + minute;
    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    return  hour + ":" + minute + ":" + sec + "  " + day + "." + month + "." + year;
}



function Place_Order_Sell_Bitcoin_Market(volume, price, total_budget) {
	kraken.api('AddOrder', {
				"pair": 'XBTCZEUR',
				"type": 'sell',
				"ordertype": 'market',
				"volume": volume,
				}, function(error, data) {
				if(error) {
					console.log(error);
				}
				else {
					console.log("sold volume of BTC " + volume);
					console.log("price of BTC " + price);
					console.log(" ");
				}
			});
	var log_text = getDateTime() + ", ID " + ticker_id + " , selling bitcoins " + volume + "BTCs, price " + price + "€, \r\ntotal asset before order " + total_budget + "€.\r\n"; 
	fs.appendFile("broker.log", log_text, function(err) {
		if(err) {
			return console.log(err);
		}
	});
}


function Place_Order_Buy_Bitcoin_Market(volume, price, total_budget) {
	kraken.api('AddOrder', {
				"pair": 'XBTCZEUR',
				"type": 'buy',
				"ordertype": 'market',
				"volume": volume,
				}, function(error, data) {
				if(error) {
					console.log(error);
				}
				else {
					console.log("bought volume of BTC " + volume);
					console.log("price of BTC " + price);
					console.log(" ");
				}
			});
	var log_text = getDateTime() + ", ID " + ticker_id + " , buying bitcoins " + volume + "BTCs, price " + price + "€, \r\ntotal asset before order " + total_budget + "€.\r\n"; 
	fs.appendFile("broker.log", log_text, function(err) {
		if(err) {
			return console.log(err);
		}
	});
}


function tradeDecision(btc_budget_, euro_budget_, ask_price, ask_volume, bid_price, bid_volume) {
	var lastMAindex = parseInt(MApoints.length - 1), 
		lastEMAindex = parseInt(EMApoints.length - 1);
		
	console.log(' ');
	console.log('Last MA value ' + MApoints[lastMAindex]);
	console.log('Last EMA value ' + EMApoints[lastEMAindex]);
	console.log(' ');
	var total_budget = euro_budget_ + btc_budget_ * bid_price;
	if (EMApoints[lastEMAindex] > (MApoints[lastMAindex] + hysteresis)) {
			//buy bitcoin
			if (euro_budget_ >= 10.0) {
				//you can buy some bitcoins, so check ticker data ask_volume and ask_price
				if (euro_budget_ <= (ask_volume * ask_price)) {
					//nakup btc za vsetky eura na ucte
					console.log('buy for all Euros from account');
					var calculated_volume = euro_budget_ / ask_price;
					Place_Order_Buy_Bitcoin_Market(calculated_volume, ask_price, total_budget);
					console.log('Bought volume = ' + calculated_volume + 'BTCs');
				} else {
					//nakup len za cast penazi, cize len ask_volume
					console.log('buy only asked volume');
					Place_Order_Buy_Bitcoin_Market(ask_volume, ask_price, total_budget);
					console.log('Bought volume = ' + ask_volume + 'BTCs');
				}
			} else {
				console.log('Not enough Euros on account! Current euro budget ' + euro_budget_ + '€.');
			}
		} else if (EMApoints[lastEMAindex] <= (MApoints[lastMAindex] - hysteresis)) {
			//sell bitcoin
			if (btc_budget_ >= 0.01) {
				//you can sell some bitcoins, so check ticker data bid_volume and bid_price
				if (btc_budget_ <= bid_volume) {
					//predaj vsetky btc z uctu
					console.log('sell all BTCs from account');
					Place_Order_Sell_Bitcoin_Market(btc_budget_, bid_price, total_budget);
					console.log('sold volume = ' + btc_budget_ + 'BTCs');
				} else {
					//predaj len take mnozstvo, ktore urcite odkupia
					console.log('sell only bid volume of BTCs');
					Place_Order_Sell_Bitcoin_Market(bid_volume, bid_price, total_budget);
					console.log('sold volume = ' + bid_volume + 'BTCs');
				}
			} else {
				console.log('Not enough BTCs on account! Current BTC budget ' + btc_budget_ + 'BTCs.');
			}
		} else {
			console.log('No order placed.')
		}
}

function DoTheJob() {
	if(!trade) {
		//simulation
		getMA_EMA(epoch, time_step_in_minutes, ma_count, ema_count, function(){
			console.log('Done.');
		});
	} else {
		//real trading	
		Get_My_Balances(function(btc, eur){
			console.log('Balances received.');
			btc_budget = parseFloat(btc);
			euro_budget = parseFloat(eur);
			getMA_EMA(epoch, time_step_in_minutes, ma_count, ema_count, function(){
					console.log(' ');
					console.log("MA and EMA done, let's trade...");
					ticker_id++;
					Get_Tickeer(function(ask_price, ask_volume, bid_price, bid_volume){
						console.log('Ticker received.');
						tradeDecision(btc_budget, euro_budget, ask_price, ask_volume, bid_price, bid_volume);							
				});
			});
		});
	}
}


if((!argv.help) && (!argv.h)) {
	var ema_count = 3, ma_count = 30;
	
	console.log(' ');
	if(!argv.trade) {
		console.log('Budget: ');
		if(argv.b != undefined) console.log(argv.b + 'Btc');
		if(argv.e != undefined) console.log(argv.e + '€'); else if(argv.b == undefined) console.log('1000€');
		btc_budget = parseFloat(argv.b);
		euro_budget = parseFloat(argv.e);
	}
	
	console.log(' ');
	console.log('Unit: ');
	var unit_name = 'day';
	if(argv.unit == undefined) {
		time_step_in_minutes = 1440; // default 1 day
	} else {
		switch(argv.unit) {
			case 'minute' : time_step_in_minutes = 1; unit_name = 'minute'; break;
			case 'hour' : time_step_in_minutes = 60; unit_name = 'hour'; break;
			case 'day' : time_step_in_minutes = 1440; unit_name = 'day'; break;
			case 'week' : time_step_in_minutes = 10080; unit_name = 'week'; break;
			default  : time_step_in_minutes = 1440; unit_name = 'day'; break;
		}
	}
	console.log(unit_name + ' in minutes = ' + time_step_in_minutes);
	console.log(' ');
	
	if((argv.macount != undefined) && (!isNaN(argv.macount))) ma_count = parseInt(argv.macount);
	console.log(' ');
	console.log('Moving Average Unit Count: ' + ma_count + ' ' + unit_name);
	if((argv.emacount != undefined) && (!isNaN(argv.emacount))) ema_count = parseInt(argv.emacount);
	console.log(' ');
	console.log('Exponential Moving Average Unit Count: ' + ema_count + ' ' + unit_name);

	var now = new Date();
	var epoch = 0;

	if (argv.datetime != undefined) {
		epoch = moment(argv.datetime,'HH:mm:ss,DD.MM.YYYY').unix();
		console.log('Since ' + argv.datetime + ', in unix time ' + epoch);
	} else {
		epoch = moment(now).unix() - time_step_in_minutes*60*ema_count;
		console.log('Since ' + now + ', in unix time ' + epoch);
	}
	
	if(argv.trade) {
		trade = true;
		console.log(' ');
		console.log('RUNNING WITH TRADING !!!');
		console.log(' ');
	} else {
		getMA_EMA(epoch,time_step_in_minutes,ma_count,ema_count, function(){
			console.log('Done.');
		}); //1451606400, 1440, 30, 3
	}

	http.createServer(function (req, response) {
		if(req.url === ('/' + argv.name)) {
			var labelHistory = "<b>History of trades:</b> \n" + fs.readFileSync('broker.log', 'utf-8');
			labelHistory = labelHistory.replace(/\r/gi,' ').split("\n").join("<br/>");
			var labelConsoleLog = "<b>Console log:</b> \n" + fs.readFileSync('console.log', 'utf-8');
			labelConsoleLog = labelConsoleLog.replace(/\r/gi,' ').split("\n").join("<br/>");
			fs.readFile('index.html', 'utf-8', function (err, data) {
				response.writeHead(200, { 'Content-Type': 'text/html' });
				var result = data.replace('{{chartData1}}', JSON.stringify(MApoints));
				result = result.replace('{{chartXlabels}}', JSON.stringify(chartLabel));
				result = result.replace('{{chartData2}}', JSON.stringify(EMApoints));
				result = result.replace('{{labelLog}}', JSON.stringify(labelLog));			
				result = result.replace('{{labelHistory}}', JSON.stringify(labelHistory));
				result = result.replace('{{labelConsoleLog}}', JSON.stringify(labelConsoleLog));
				response.write(result);
				response.end();
			});
		}
	}).listen(8888, '127.0.0.1');
	

	console.log('Server running at http://127.0.0.1:8888/');
	console.log('Starting ticker with 5 minute interval...');
	console.log('---------------------------------------------------------------');
	DoTheJob();
	
	setInterval(function(){ 
		console.log(' ');
		console.log(' ');
		console.log(' ');
		console.log('---------------------------------------------------------------');
		console.log(' ');
		console.log('Reading new data...');
		DoTheJob();		
	}, 300000);
	
} else {
	console.log(' ');
	console.log(' ****************************** Help ******************************** ');
	console.log(' ');
	console.log('  --help | -help | --h | -h   ->   show this HELP.                    ');
	console.log(' ');
	console.log('  --e | -e     ->  starting budget in €. (Optional parameter)         ');
	console.log('   example with parameter -e 1000 trader will start with 1000€ budget,');
	console.log('   default value is 1000€                                             ');
	console.log(' ');
	console.log('  --b | -b     ->  starting budget in BTC. (Optional parameter)       ');
	console.log('   example with parameter -b 1 trader will start with 1BTC budget,    ');
	console.log('   default value is 0 BTC                                             ');
	console.log(' ');
	console.log('  --datetime   ->  date time since history. (Optional parameter)      ');
	console.log('   example --datetime 1:2:3,4.5.2016 data since 4.May 2016 1h,2m,3s   ');
	console.log('   default value is current date time substracted by unit count       ');
	console.log(' ');
	console.log('  --unit -> time unit of step on X axis on graph. (Optional parameter)');
	console.log('   example --unit minute   (one step on X axis is 1 minute)           ');
	console.log('   default step is day (possible values: minute hour day week )       ');
	console.log(' ');
	console.log('  --macount -> moving average units count. (Optional parameter)       ');
	console.log('   example --macount 50    (takes last 50 units of time to calculate) ');
	console.log('   default value is 30                                                ');
	console.log(' ');
	console.log('  --emacount -> exponential moving average units count. (Optional p.) ');
	console.log('   example --emacount 5    (takes last 5 units of time to calculate)  ');
	console.log('   default value is 3                                                 ');
	console.log(' ');
	console.log('  --trade -> enable live trading!!! (Optional parameter)              ');
	console.log('   example --trade	        (enable trades via Kraken API)             ');
	console.log('   default is simulation without trading activated                    ');
	console.log(' ');
	console.log('  --name -> sets the name of server process (mandatory parameter)     ');
	console.log('   example --name meno	    (sets name of running process)             ');
	console.log('   default is none                                                    ');
	console.log(' ');
	console.log(' Graph visualisation server runs on http://127.0.0.1:8888         ');
	console.log(' optimalised for chrome web browser                                   ');
	console.log(' ');
	console.log('Enjoy :) ');
	console.log(' €€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€€ ');
	console.log(' ');
}
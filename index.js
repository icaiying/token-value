const R = require('ramda')
const Rx = require('rxjs/Rx')
const axios = require('axios')
const express = require('express')
const compression = require('compression')
const cors = require('cors')

let markets = null
let marketsKey = null
let exchangeRates = null
let supportTokens = []

async function exchange(base, symbols) {
    return axios.get(`https://api.fixer.io/latest?base=${base}&symbols=${symbols.join(',')}`)
        .then(res => {
            return res.data
        })
        .then(val => {
            exchangeRates = val
            return val
        })
        .catch(err => console.log(err))
}

async function marketsFromBigOne() {
    return axios.get('https://api.big.one/markets').then(res => res.data).
        then(resp => {
            const result = {}
            resp.data.forEach(element => {
                result[element.symbol] = element.ticker.price
            })
            return result
        })
        .then(val => {
            markets = val
            marketsKey = Object.keys(val)
            supportTokens = marketsKey.reduce((acc, value, index) => {
                return R.union(acc, value.split('-'))
            }, [])
            return val
        })
        .catch(err => console.log(err))
}

async function api(tokens) {
    if (!markets || !marketsKey || !exchangeRates) {
        return null
    }

    tokens = tokens.filter(token => supportTokens.indexOf(token.toUpperCase()) > -1)
    const wrapTokens = tokens.map(ele => wrapToken(ele.toUpperCase(), marketsKey))
    const usd2cny = exchangeRates.rates['CNY']

    const resultJson = {
        'USD': {
            EXCHANGE: 'USD-CNY',
            USD: 1,
            CNY: usd2cny
        }
    }
    wrapTokens.forEach(wrapTokenElement => {
        const tokens = wrapTokenElement.split('-')
        let valueOfUSDT = Number(markets[`${tokens[0]}-${tokens[1]}`])
        for (let i = 1, len = tokens.length; i < len - 1; i++) {
            valueOfUSDT *= markets[`${tokens[i]}-${tokens[i + 1]}`]
        }
        resultJson[tokens[0]] = {
            EXCHANGE: wrapTokenElement,
            USD: valueOfUSDT,
            CNY: valueOfUSDT * usd2cny
        }
    })
    return resultJson
}

function wrapToken(token, markets) {
    let wrapToken = token
    if (markets.indexOf(`${token}-USDT`) > -1) {
        wrapToken += '-USDT'
    } else if (markets.indexOf(`${token}-BTC`) > -1) {
        wrapToken += '-BTC-USDT'
    } else if (markets.indexOf(`${token}-ETH`) > -1) {
        wrapToken += '-ETH-USDT'
    } else if (markets.indexOf(`${token}-EOS`) > -1) {
        wrapToken += '-EOS-USDT'
    } else if (markets.indexOf(`${token}-QUTM`) > -1) {
        wrapToken += '-QUTM-BTC-USDT'
    } else if (markets.indexOf(`${token}-BNC`) > -1) {
        wrapToken += '-BNC'
    }
    return wrapToken
}

function main() {
    Rx.Observable
        .interval(10 * 1000 /* ms */)
        .startWith(0)
        .timeInterval()
        .subscribe(async (next) => {
            console.log('exchange update start')
            await exchange('USD', ['CNY'])
            console.log('exchange update end')
        },
        (err) => {
            console.log('Error: ' + err);
        },
        () => {
            console.log('Completed');
        });

    Rx.Observable
        .interval(30 * 1000 /* ms */)
        .startWith(0)
        .timeInterval()
        .subscribe(async (next) => {
            console.log('big.one update start')
            await marketsFromBigOne()
            console.log('big.one update end')
        },
        (err) => {
            console.log('Error: ' + err);
        },
        () => {
            console.log('Completed');
        });
}



const app = express()
app.use(compression())
app.use(cors({
    "methods": "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    "allowedHeaders": ['Content-Type', 'Origin', 'X-Requested-With', 'Accept']
}))
app.use((err, req, res, next) => {
    logger.error({ err, reqNoBody: req }, `Uncatch: ${err.message}`);

    if (req.xhr) {
        let statusCode = res.statusCode || 500;
        if (Number(statusCode) === 200) {
            statusCode = 500;
        }
        return res.status(statusCode).json({ code: 0, err: { err_code: 0, message: err.message } });
    }
    return res.status(500).json({ code: 0, err: { err_code: 0, message: err.message } });
})

app.get('/latest', async function (req, res) {
    const params = req.query['symbols']

    let result = { error: 'invalid request.' }
    if (params) {
        result = await api(params.split(',')).catch(err => console.log(err))
    }
    return res.json(result)
})

main()

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is listening on port ${PORT}`))
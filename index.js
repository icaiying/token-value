const Rx = require('rxjs/Rx')
const axios = require('axios')
const express = require('express')
const compression = require('compression')

let markets = null
let marketsKey = null
let exchangeRates = null

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
            return val
        })
        .catch(err => console.log(err))
}

async function api(tokens) {
    if (!markets || !marketsKey || !exchangeRates) {
        return null
    }

    const wrapTokens = tokens.map(ele => wrapToken(ele, marketsKey))
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
        .timeInterval()
        .subscribe(async (next) => {
            await exchange('USD', ['CNY'])
            await marketsFromBigOne()
            console.log('data update')
        },
        (err) => {
            console.log('Error: ' + err);
        },
        () => {
            console.log('Completed');
        });
}



const app = express()
app.use(compression());

app.get('/latest', async function (req, res) {
    let params = req.query['symbols'] || req.params['symbols']
    const result = await api(params.split(','))
    return res.json(result)
})

main()
app.listen(3000, () => console.log('Example app listening on port 3000!'))
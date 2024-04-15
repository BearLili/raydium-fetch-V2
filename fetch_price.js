const config = require('./config/fetch_price_config.json')
const chainName = 'sol'
const bookPrefix = 'amm:'

// redis
// let redisClient

const raydiumV4 = require('./raydiumV4/raydiumV4.js')
const raydiumCLMM = require('./raydiumCLMM/raydiumCLMM.js')

// Json data

// bot need's data;
function priceDataTransfer({ result, tokenJson, timestamp }) {
  let [bidsInfo, asksInfo] = result || [[], []]
  let isV4 = tokenJson?.connector == 'raydiumV4'
  // [amountOut,minAmountOut,currentPrice,executionPrice,priceImpact,fee,amountIn];
  let _bidsPrice = bidsInfo?.[0]?.toFixed() / tokenJson?.amount
  let _asksPrice = asksInfo?.[0]?.toFixed() / tokenJson?.amount
  let asksPrice = isV4 ? _asksPrice?.toFixed(9) : _asksPrice?.toFixed(9)
  let bidsPrice = isV4 ? _bidsPrice?.toFixed(9) : _bidsPrice?.toFixed(9)

  let resultTokenInfo = {
    pairAddress: tokenJson?.pairKeys,
    // pairFee: bidsInfo?.[5]?.toFixed(),
    asks: [[asksPrice, tokenJson?.amount, timestamp]],
    bids: [[bidsPrice, tokenJson?.amount, timestamp]],
    pair: [tokenJson?.baseAsset, tokenJson?.quoteAsset, 'token_in_key', 'token_out_key'],
    baseCurrency: tokenJson?.baseAsset,
    quoteCurrency: tokenJson?.quoteAsset,
    timestamp: timestamp,
    sequence: timestamp,
    connector: tokenJson?.connector,
    symbol: `${tokenJson?.baseAsset}/${tokenJson?.quoteAsset}`,
  }

  return resultTokenInfo
}

// push to redis;
function pushToRedis(data) {
  const channel = `${bookPrefix}${chainName}`
  //   redisClient.setEx(channel, 60, JSON.stringify(data));
}

async function compute({ pool_keys_CLMM, pool_keys_V4, config_tokenArr_CLMM, config_tokenArr_V4 }) {
  let beginCompute = new Date().getTime()
  let pushData = []
  // CLMM
  let raydiumCLMM_res =
    pool_keys_CLMM?.length && (await raydiumCLMM.poolInfoToCompute(pool_keys_CLMM, config_tokenArr_CLMM))
  raydiumCLMM_res = raydiumCLMM_res.map((i, idx) => {
    return { ...i, tokenJson: config_tokenArr_CLMM?.[idx] }
  })
  // V4
  let raydiumV4_res = pool_keys_V4?.length && (await raydiumV4.poolInfoToCompute(pool_keys_V4, config_tokenArr_V4))
  raydiumV4_res = raydiumV4_res.map((i, idx) => {
    return { ...i, tokenJson: config_tokenArr_V4?.[idx] }
  })

  raydiumCLMM_res.concat(raydiumV4_res).map((i) => {
    let index = pushData.findIndex((p) => p.symbol == i?.tokenJson?.symbol)
    if (index >= 0) {
      pushData[index].value.push(priceDataTransfer(i))
    } else {
      pushData.push({
        // blockNumber: 123,
        // ts: 1712494596290,
        symbol: i?.tokenJson?.symbol,
        chainName: 'sol',
        value: [priceDataTransfer(i)],
      })
    }
  })

  console.log(`\n`)
  console.dir(pushData, { depth: null, colors: true })
  // End
  console.log(`\n`, 'cost', new Date().getTime() - beginCompute, 'ms')
  console.log(`\n -------------------------------------`)
  // ---
  // await compute({ pool_keys_CLMM, pool_keys_V4, config_tokenArr_V4, config_tokenArr_CLMM })
}

// main
async function main(config) {
  try {
    let config_tokenArr_V4 = config?.amms?.filter((i) => i?.connector == 'raydiumV4') || [],
      config_tokenArr_CLMM = config?.amms?.filter((i) => i?.connector == 'raydiumCLMM') || [],
      pool_keys_CLMM = [],
      pool_keys_V4 = []
    if (config_tokenArr_CLMM?.length) pool_keys_CLMM = await raydiumCLMM.fetchPoolInfos(config_tokenArr_CLMM)
    if (config_tokenArr_V4?.length) pool_keys_V4 = await raydiumV4.fetchPoolInfos(config_tokenArr_V4)
    await compute({ pool_keys_CLMM, pool_keys_V4, config_tokenArr_V4, config_tokenArr_CLMM })
  } catch (error) {
    console.error('Error during computations:', error)
  }
}

main(config)

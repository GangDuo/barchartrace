const moment = require('moment');
const DailySalesIncludeTaxEveryStore = require('./DailySalesIncludeTaxEveryStore');

function term() {
  const pattern = "YYYY-MM-DD"
  const yesterday = () => moment().subtract(1, 'days')
  let beginDate = moment().date(1)
  let endDate = moment()

  if(moment().date() === 1) {
    beginDate =  yesterday().date(1)
    endDate = yesterday()
  }
  return {
    beginDate: beginDate.format(pattern),
    endDate: endDate.format(pattern),
    tag: endDate.format("YYYYMM")
  }
}

(async(args) => {
  const ins = new DailySalesIncludeTaxEveryStore()
  await ins.fetch(args)
  await ins.writeAsCsv({path: `${args.tag}.csv`})//
})(term())
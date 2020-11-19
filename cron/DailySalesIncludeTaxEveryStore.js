const fs = require("fs");
const { AsyncParser } = require("json2csv");
const { Readable, Transform } = require('stream');
const mysql = require('promise-mysql');

/**
 * 記述方法
 * [
 *   [code, name],
 *   ...,
 *   [code, name]
 * ]
 */
const stores = JSON.parse(fs.readFileSync(process.env.STORES_JSON_FILE, 'utf8'));
const storeCodes = stores.map(x => x[0]);
const storeNames = stores.map(x => x[1]);
const getStoreNameByCode = (code) => storeNames[storeCodes.findIndex(x => x === code)]

const commandText = `
  SELECT DATE_FORMAT(\`date\`, '%Y-%m-%d') AS \`date\`,
         store_code,
         SUM(sales_include_tax) AS gross_sales_include_tax
    FROM humpty_dumpty.simple_journals
   WHERE (\`date\` BETWEEN ? AND ?)
     AND (store_code IN(${stores.map(_ => '?').join(',')}))
GROUP BY \`date\`, store_code
ORDER BY \`date\``;

class DailySalesIncludeTaxEveryStore {
  constructor() {
    this.source = null
  }

  async fetch({beginDate, endDate}) {
    console.log(`${beginDate} - ${endDate}`)
    const connection = await mysql.createConnection({
      host: process.env.HOST,
      port: process.env.PORT,
      user: process.env.USER,
      password: process.env.PASSWORD,
      database: process.env.DATABASE,
    });
  
    try {
      const rows = await connection.query(commandText, [beginDate, endDate, ...storeCodes]);
      /**
       * JSONは日付をキーにして、店舗の売上金額を持つ
       * {
       *   日付: {
       *     店舗コード: 金額,
       *   }
       * }
       */
      this.source = rows.reduce((ax, row) => {
        const d = row['date']
        const s = row['store_code']
        if(!ax.hasOwnProperty(d)) {
          ax[d] = {}
        }
        ax[d][s] = row['gross_sales_include_tax']
        return ax
      }, {})
    } catch (e) {
      console.log(e);
    } finally {
      await connection.end();
    }  
  }

  /**
   * {
   *   日付: {
   *     店舗コード: 金額,
   *   }
   * }
   * 
   * ↓↓↓ 変換 ↓↓↓
   * 
   * [{
   *   date: 日付,
   *   店舗名: 金額,
   * },]
   */
  transform() {
    if(!this.source) return

    const source = this.source
    return Object.keys(source).reduce((ax, d, i) => {
      const payload = (_ => {
        if(i === 0) {
          return storeCodes
            .reduce((xs, storeCode) => {
              const storeName = getStoreNameByCode(storeCode)
              xs[storeName] = source[d][storeCode] || 0
              return xs
            }, {})
          return Object.keys(source[d]).reduce((xs, storeCode) => {
            const storeName = getStoreNameByCode(storeCode)
            xs[storeName] = source[d][storeCode]
            return xs
          }, {})
        } else {
          return storeCodes
            .reduce((xs, storeCode) => {
              const storeName = getStoreNameByCode(storeCode)
              xs[storeName] = ax[i - 1][storeName] + (source[d][storeCode] || 0)
              return xs
            }, {})
        }  
      })()
      ax.push({date: d, ...payload})
      return ax
    }, [])  
  }

  async writeAsCsv(options) {
    options = options || {}
    const dest = options.path ? fs.createWriteStream(options.path, 'utf8') : process.stdout
    const opts = {
      fields: ['date', ...storeNames]
    };
    const transformOpts = { readableObjectMode: true, writableObjectMode: true };
    const parser = new AsyncParser(opts, transformOpts);
    const input = new Readable({ objectMode: true });
    input._read = () => {}; // redundant? see update below
    this.transform().forEach(item => input.push(item));
    input.push(null);
    const processor = parser.fromInput(input).toOutput(dest);
  
    await processor.promise(false).catch(err => console.error(err));
  }
}

module.exports = DailySalesIncludeTaxEveryStore
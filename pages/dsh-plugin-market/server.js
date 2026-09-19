const http = require('node:http')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const PORT = Number(process.env.PORT || 8889)
const PAGE = readFileSync(join(__dirname, 'index.html'), 'utf-8')

http
  .createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/index')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGE)
      return
    }
    res.writeHead(404).end('not found')
  })
  .listen(PORT, '127.0.0.1', () => console.log('dsh-plugin-market listening on ' + PORT))

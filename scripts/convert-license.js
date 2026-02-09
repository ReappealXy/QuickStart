const fs = require('fs')
const iconv = require('iconv-lite')

const content = fs.readFileSync('build/license.txt', 'utf-8')
const gbkBuf = iconv.encode(content, 'gbk')
fs.writeFileSync('build/license.txt', gbkBuf)
console.log('Converted license.txt to GBK:', gbkBuf.length, 'bytes')

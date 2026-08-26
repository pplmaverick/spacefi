const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  const filePath = 'file://' + path.resolve(__dirname, '../assets/spacefinance_deck.html');
  await page.goto(filePath, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  await page.pdf({
    path: path.resolve(__dirname, '../assets/deck.pdf'),
    width: '960px',
    height: '540px',
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 }
  });
  await browser.close();
  console.log('Done: assets/deck.pdf');
})();

import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ROOT,loadConfig,projectPath} from '../config.mjs';
const config=await loadConfig();
const require=createRequire(projectPath(config.paths.hyperframes));
const puppeteer=require('puppeteer-core');
const dir=resolve(ROOT,'work/pipeline/demo-assets');await mkdir(dir,{recursive:true});
if(!config.paths.browser)throw new Error('Set paths.browser to a Chrome/Chromium executable before running demo:prepare.');const browser=await puppeteer.launch({executablePath:projectPath(config.paths.browser),headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage();await page.setViewport({width:1080,height:1100,deviceScaleFactor:1});
  await page.setContent(`<html><body style="margin:0;background:#fffdf8"><svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1100" viewBox="0 0 1080 1100"><rect x="65" y="65" width="950" height="970" rx="42" fill="#eef5ef"/><text x="540" y="205" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="53" fill="#25212b">Same sheet, new cross-section</text><path d="M190 425 H890" stroke="#25212b" stroke-width="14"/><text x="540" y="515" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#625c68">Flat sheet</text><path d="M190 790 L260 660 L330 790 L400 660 L470 790 L540 660 L610 790 L680 660 L750 790 L820 660 L890 790" fill="none" stroke="#007e84" stroke-width="14" stroke-linejoin="round"/><text x="540" y="920" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#625c68">Accordion folds</text></svg></body></html>`);
  await page.screenshot({path:resolve(dir,'fold-cross-section.png')});
}finally{await browser.close();}
console.log('Demo illustration prepared locally. No generation provider was called.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('C:/Users/charl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const rootDir = path.resolve(process.argv[2] || '.');
  const output = path.resolve('outputs/engraving-20261106');
  fs.mkdirSync(output, {recursive:true});
  const types = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm','.png':'image/png','.ttf':'font/ttf'};
  const server = http.createServer((req,res) => {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file = path.resolve(rootDir,'.'+(pathname==='/'?'/index.html':pathname));
    if (!file.startsWith(rootDir+path.sep)) {res.writeHead(403).end();return;}
    fs.readFile(file,(error,data) => {
      if (!error && file === path.join(rootDir,'app.js')) data = Buffer.from(data.toString()+'\nwindow.__engravingTest={root,camera,composer,placementInWorld,openEngravingEditor,configuration:()=>currentViewerConfiguration};');
      res.writeHead(error?404:200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
      res.end(error?'Missing':data);
    });
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page = await browser.newPage({viewport:{width:1150,height:760}});
    const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error);});
    page.on('console',message=>{if(message.type()==='error')console.error(message.text());});
    await page.goto('http://127.0.0.1:'+server.address().port+'/');
    await page.locator('[data-key="family"][data-value="NEW SMALL"]').click();
    for(const key of ['plugSize','crystalSize','metal','metalFinish','ornament','ornamentFinish']) {
      await page.locator(`[data-welcome-choice][data-key="${key}"]`).first().click();
    }
    await page.locator('#personalization-enabled').check();
    await page.locator('#personalization-text').fill('Élodie');
    await page.locator('#personalization-font').selectOption('sansita-swashed');
    await page.waitForFunction(()=>document.querySelector('#personalization-text').style.fontFamily.includes('Rosebuds-sansita-swashed'));
    await page.screenshot({path:path.join(output,'catalogue-font.png')});
    await page.locator('[data-open-model="plug-new-small-cristal"]').first().click();
    await page.waitForURL(url=>url.searchParams.get('engravingFont')==='sansita-swashed');
    await page.waitForFunction(()=>document.body.dataset.viewerReady==='true' && window.__engravingTest,{},{timeout:90000});
    const inspect=()=>page.evaluate(()=>{
      const {root,camera,placementInWorld,configuration}=window.__engravingTest;
      const items=[];root.traverse(decal=>{
        if(!decal.userData.personalizedEngraving)return;
        const p=placementInWorld(decal.stemDecalPlacement,decal.stemDecalFrameWorld,decal.stemDecalModel.matrixWorld);
        const point=p.center.clone().project(camera);
        items.push({text:decal.userData.engravingText,vertices:decal.geometry.attributes.position.count,normal:p.normal.toArray(),facing:p.normal.dot(camera.position.clone().sub(p.center).normalize()),camera:camera.position.toArray(),x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2});
      });
      return {items,configuration:configuration()?.personalization};
    });
    const initial=await inspect();console.log(JSON.stringify(initial));
    assert.equal(initial.items.length,1);
    assert.equal(initial.items[0].text,'Élodie');
    assert.equal(initial.configuration.font,'Sansita Swashed');
    assert(initial.items[0].vertices>0);
    assert(initial.items[0].facing>.5 && initial.items[0].camera[1]>0);
    await page.screenshot({path:path.join(output,'desktop.png')});
    await page.mouse.click(initial.items[0].x,initial.items[0].y,{button:'right'});
    await page.getByRole('menuitem',{name:'Modifier la gravure…'}).click({timeout:5000});
    await page.getByRole('textbox',{name:'Prénom ou mot'}).fill('Maël');
    await page.getByRole('combobox',{name:'Police de gravure'}).selectOption('nickainley');
    await page.getByRole('button',{name:'Valider',exact:true}).click();
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('engravingText')==='Maël');
    const edited=await inspect();
    assert.equal(edited.items[0].text,'Maël');
    assert.equal(edited.configuration.text,'Maël');
    assert.equal(edited.configuration.font,'Nickainley Normal');
    assert.equal(new URL(page.url()).searchParams.get('engravingFont'),'nickainley');
    await page.mouse.move(edited.items[0].x,edited.items[0].y);
    await page.mouse.down();
    await page.mouse.move(edited.items[0].x+18,edited.items[0].y+3,{steps:6});
    await page.mouse.up();
    await page.waitForFunction(()=>new URL(location.href).searchParams.has('engravingU'),{},{timeout:5000});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,'mobile.png')});
    await page.setViewportSize({width:1150,height:760});
    await page.locator('#viewer-product-link').click();
    await page.locator('td:visible').filter({hasText:/^Maël$/}).waitFor({timeout:10000});
    await page.locator('td:visible').filter({hasText:/^Nickainley Normal$/}).waitFor({timeout:10000});
    assert.deepEqual(errors,[]);
    console.log('Engraving projected, edited and persisted.');
  } finally {
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

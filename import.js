async function readOrderFile(file){
const ext=file.name.split('.').pop().toLowerCase();
if(!['csv','txt','tsv','xlsx','xls'].includes(ext))throw Error('Выберите Excel (.xlsx, .xls) или текстовую таблицу (.csv, .tsv, .txt).');
if(ext==='csv'||ext==='txt'){const text=await file.text();if(!text.split(/\r?\n/)[0].includes('\t'))return AtlasEngine.parseCSV(text);}
if(typeof XLSX==='undefined')throw Error('Модуль Excel не загрузился. Обновите страницу.');
const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellFormula:false});
const required=['id','store','route','boxes','weight_kg','courier_ok'];
for(const name of book.SheetNames){const rows=XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',raw:true});const first=rows.findIndex(row=>required.every(h=>row.map(c=>String(c).trim().toLowerCase()).includes(h)));if(first<0)continue;const headers=rows[first].map(c=>String(c).trim().toLowerCase());const indexes=required.map(h=>headers.indexOf(h));const output=[required,...rows.slice(first+1).filter(r=>r.some(c=>String(c).trim())).map(r=>indexes.map(i=>r[i]??''))];const csv=output.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\n');return AtlasEngine.parseCSV(csv);}
throw Error('Не найден лист с колонками id, store, route, boxes, weight_kg, courier_ok. Используйте наш шаблон.');
}
if(typeof module!=='undefined')module.exports={readOrderFile};

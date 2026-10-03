/* Pure planning engine: compares full route cost with eligible external deliveries. */
(function(root){
'use strict';
function parseCSV(text){
 text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/)[0];const sep=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===sep&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('Не закрыты кавычки в CSV.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);if(rows.length<2)throw Error('В файле нужны заголовки и хотя бы одна заявка.');
 const headers=rows.shift().map(x=>x.trim().toLowerCase());const required=['id','store','route','boxes','weight_kg','courier_ok'];for(const h of required)if(!headers.includes(h))throw Error('Нет обязательной колонки: '+h);
 const seen=new Set();return rows.map((r,i)=>{if(r.length!==headers.length)throw Error('Строка '+(i+2)+': число колонок не совпадает с заголовком.');const o=Object.fromEntries(headers.map((h,j)=>[h,(r[j]||'').trim()]));const boxes=Number(o.boxes.replace(',','.')),weight=Number(o.weight_kg.replace(',','.'));if(!o.id||!o.store||!o.route||!Number.isInteger(boxes)||boxes<1||!o.weight_kg||!Number.isFinite(weight)||weight<=0)throw Error('Строка '+(i+2)+': проверьте номер, магазин, маршрут, ящики и вес.');if(seen.has(o.id))throw Error('Повторяется номер заявки: '+o.id);seen.add(o.id);if(!['0','1'].includes(o.courier_ok))throw Error('Строка '+(i+2)+': courier_ok должен быть 0 или 1.');return {id:o.id,store:o.store,route:o.route,boxes,weight,courierOK:o.courier_ok==='1'};});
}
function plan(orders,rates,mode){
 const groups=new Map();orders.forEach(o=>{if(!groups.has(o.route))groups.set(o.route,[]);groups.get(o.route).push(o)});
 const assignments=[],routes=[];let total=0,baseline=0;
 for(const [id,items]of groups){const base=rates.fixed+rates.stop*items.length;baseline+=base;
 const candidates=items.map(o=>{let channel='Свой рейс',cost=Infinity;if(o.courierOK){if(o.boxes<=1&&o.weight<=rates.walkWeight){channel='Пеший курьер';cost=rates.walk;}else if(o.boxes<=2&&o.weight<=rates.autoWeight){channel='Авто-курьер';cost=rates.auto;}}return {order:o,channel,cost};});
 let external=[];
 if(mode!=='own'){const eligible=candidates.filter(x=>Number.isFinite(x.cost));external=eligible.filter(x=>x.cost<rates.stop);if(eligible.length===items.length&&eligible.reduce((s,x)=>s+x.cost,0)<(items.length-external.length?rates.fixed:0)+rates.stop*(items.length-external.length)+external.reduce((s,x)=>s+x.cost,0))external=eligible;}
 const ids=new Set(external.map(x=>x.order.id));const remaining=items.length-external.length;const ownCost=remaining?rates.fixed+rates.stop*remaining:0;const extCost=external.reduce((s,x)=>s+x.cost,0);const cost=ownCost+extCost;total+=cost;
 routes.push({id,points:items.length,remaining,baseline:base,cost,savings:base-cost,closed:remaining===0});
 candidates.forEach(x=>assignments.push({...x.order,channel:ids.has(x.order.id)?x.channel:'Свой рейс',price:ids.has(x.order.id)?x.cost:null}));
 }
 return {mode,baseline,total,savings:baseline-total,average:total/orders.length,closed:routes.filter(r=>r.closed).length,external:assignments.filter(a=>a.channel!=='Свой рейс').length,routes,assignments};
}
root.AtlasEngine={parseCSV,plan};if(typeof module!=='undefined')module.exports=root.AtlasEngine;
})(typeof globalThis!=='undefined'?globalThis:this);

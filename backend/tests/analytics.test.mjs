import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV, normalizeActivities, analyzeActivities, reconcileOrders, csvExport } from '../src/analytics.js';
import { generateInsight } from '../src/insights.js';
const demoFile = name => readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8');
const demoRows = () => normalizeActivities(parseCSV(demoFile('atividades_demo.csv'))).rows;

test('CSV: trata aspas, vírgula protegida e quebra de linha', () => {
  const rows = parseCSV('id,nome\n1,"Equipe, A"\n2,"Cargo ""teste"""\n');
  assert.equal(rows[0].nome, 'Equipe, A');
  assert.equal(rows[1].nome, 'Cargo "teste"');
});
test('CSV: BOM e cabeçalho duplicado detectados', () => {
  assert.equal(parseCSV('\uFEFFid,status\nA,ok\n')[0].id, 'A');
  assert.throws(() => parseCSV('id,id\n1,2'),/duplicados/i);
});
test('CSV: aspas abertas geram erro', () => assert.throws(()=>parseCSV('a,b\n"erro,1'),/aspas/i));
test('Normalização: rejeita colunas obrigatórias ausentes', () => assert.throws(()=>normalizeActivities([{case_id:'A'}]),/Colunas ausentes/i));
test('Normalização: separa linhas válidas e inválidas', () => {
  const { rows, issues } = normalizeActivities(parseCSV('case_id,processo,atividade,data,duracao_min,retrabalho,execucao\nA,Pedido,Conferir,2026-10-10,10,Sim,Manual\nB,Pedido,Conferir,2026-10-11,-7,Não,Manual'));
  assert.equal(rows.length, 1); assert.equal(issues.length, 1); assert.equal(rows[0].rework,true);
});
test('Métricas: soma e percentual são determinísticos', () => {
  const rows = demoRows(); const a=analyzeActivities(rows);
  const total = rows.reduce((s,r)=>s+r.minutes,0);
  assert.equal(a.kpis.events, rows.length);
  assert.equal(a.kpis.hours, Number((total/60).toFixed(1)));
  assert.equal(a.kpis.reworkRate,Number((100*rows.filter(r=>r.rework).length/rows.length).toFixed(1)));
  assert.ok(a.activities.length > 0);assert.ok(a.activities.every(x=>x.score>=0&&x.score<=100));
});
test('Métricas: não confunde potencial com resultado comprovado', () => {
  const a=analyzeActivities(demoRows()); assert.match(a.method,/estimad/i);
  assert.ok(a.projectedHours >= 0);
});
test('Conciliação: demo contém conciliados e exceções', () => {
  const result = reconcileOrders(demoFile('pedidos_demo.csv'),demoFile('pagamentos_demo.csv'));
  assert.ok(result.ok > 0);assert.ok(result.exceptions > 0);
  assert.equal(result.ok + result.exceptions,result.results.length);
});
test('Conciliação: detecta ausentes, duplicados e divergências', () => {
  const a='pedido_id,valor_pedido\nA,10\nB,20\nB,20\nC,30\nD,40\n';
  const b='pedido_id,valor_pago\nA,10\nB,20\nC,25\nD,40\nD,40\nX,10\n';
  const out=reconcileOrders(a,b);
  assert.equal(out.ok,2);assert.equal(out.exceptions,4);
  assert.ok(out.results.some(r=>r.detail==='Divergência de valor'));
  assert.ok(out.results.some(r=>r.detail==='Pagamento duplicado'));
  assert.ok(out.results.some(r=>r.detail==='Pedido duplicado'));
  assert.ok(out.results.some(r=>r.detail==='Pagamento sem pedido'));
});
test('Exportação: CSV contém colunas e todos os resultados',()=> {
  const out = reconcileOrders('pedido_id,valor_pedido\nA,5\n','pedido_id,valor_pago\nA,5\n');
  const csv = csvExport(out.results); assert.match(csv,/pedido_id,valor_pedido/);assert.match(csv,/conciliado/);
  assert.equal(parseCSV(csv).length,1);
});
test('Insight: sem API key, expõe claramente modo regras',async()=> {
  const old = process.env.GEMINI_API_KEY;delete process.env.GEMINI_API_KEY;
  try { const result = await generateInsight(analyzeActivities(demoRows()),'Quais são as prioridades?');
    assert.equal(result.mode,'rules');assert.match(result.disclaimer,/Não utiliza modelo generativo/i); }
  finally {if(old)process.env.GEMINI_API_KEY=old;}
});

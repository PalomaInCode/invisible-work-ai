import express from 'express';
import helmet from 'helmet';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { parseCSV, normalizeActivities, analyzeActivities, reconcileOrders, csvExport } from './analytics.js';
import { generateInsight } from './insights.js';

const here = dirname(fileURLToPath(import.meta.url));
const demoDir = join(here, '../data');
const getDemo = name => readFileSync(join(demoDir, name), 'utf8');
const demoActivities = () => normalizeActivities(parseCSV(getDemo('atividades_demo.csv'))).rows;
const demoAnalysis = () => analyzeActivities(demoActivities());
const normalizeText = x => String(x ?? '');
const fingerprint = (a,b) => crypto.createHash('sha256').update(a+'\u0000'+b).digest('hex');
const runs = [];
const MAX_CSV_BYTES = 2_000_000;

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy:false }));
app.use(express.json({limit:'3mb'}));
app.use((req,res,next)=> {res.set('Cache-Control','no-store'); next();});

app.get('/api/health', (_req,res) => res.json({ok:true,service:'Invisible Work API',version:'1.0.0'}));
app.get('/api/demo', (_req,res) => res.json({analysis:demoAnalysis(),rows:demoActivities().slice(0,600),dataset:'sintético',info:'Registros fictícios criados apenas para demonstrar a aplicação.'}));
app.get('/api/demo/file/:name', (req,res) => {
  const allowed = {atividades:'atividades_demo.csv',pedidos:'pedidos_demo.csv',pagamentos:'pagamentos_demo.csv'};
  const file = allowed[req.params.name];
  if (!file) return res.status(404).json({error:'Arquivo não encontrado.'});
  res.type('text/csv; charset=utf-8').send(getDemo(file));
});
app.post('/api/analyze', (req,res) => {
  try {
    const csv = req.body?.csv;
    if (typeof csv !== 'string' || !csv || Buffer.byteLength(csv) > MAX_CSV_BYTES) return res.status(400).json({error:'Envie um CSV de até 2 MB.'});
    const {rows,issues} = normalizeActivities(parseCSV(csv));
    if (rows.length > 10000) return res.status(400).json({error:'Limite de 10.000 linhas por análise.'});
    return res.json({analysis:analyzeActivities(rows),rows,issues,dataset:'importado'});
  } catch (e) {return res.status(400).json({error:e.message});}
});
app.post('/api/insights', async (req,res) => {
  try {
    const analysis = req.body?.analysis;
    if (!analysis || !analysis.kpis || !Array.isArray(analysis.activities)) return res.status(400).json({error:'Análise inválida.'});
    const question = normalizeText(req.body?.question).slice(0,600);
    return res.json(await generateInsight(analysis, question));
  } catch(e) {return res.status(400).json({error:'Não foi possível gerar insights.'});}
});
const inputs = body => {
  const orders = body?.ordersCsv ?? getDemo('pedidos_demo.csv');
  const payments = body?.paymentsCsv ?? getDemo('pagamentos_demo.csv');
  if (typeof orders !== 'string' || typeof payments !== 'string' || Buffer.byteLength(orders)+Buffer.byteLength(payments) > MAX_CSV_BYTES) throw new Error('Arquivos inválidos ou excedem 2 MB.');
  return {orders,payments};
};
app.post('/api/automation/preview', (req,res) => {
  try {
    const {orders,payments} = inputs(req.body);
    const result = reconcileOrders(orders,payments);
    return res.json({...result,previewHash:fingerprint(orders,payments),dryRun:true,notice:'Simulação: nenhum sistema externo foi modificado.'});
  }catch(e){return res.status(400).json({error:e.message});}
});
app.post('/api/automation/execute', (req,res) => {
  try {
    const {orders,payments} = inputs(req.body);
    if (req.body?.approved !== true) return res.status(403).json({error:'A aprovação humana é obrigatória.'});
    if (req.body?.previewHash !== fingerprint(orders,payments)) return res.status(409).json({error:'Os arquivos mudaram. Gere uma nova prévia antes de executar.'});
    const result = reconcileOrders(orders,payments);
    const run = {id:`RUN-${Date.now()}`,at:new Date().toISOString(),ok:result.ok,exceptions:result.exceptions,mode:'CSV local, sem escrita externa'};
    runs.unshift(run); if (runs.length>20) runs.pop();
    return res.json({...result,run,csv:csvExport(result.results),notice:'Conciliação executada e CSV gerado. Nenhum dado externo foi alterado.'});
  }catch(e){return res.status(400).json({error:e.message});}
});
app.get('/api/automation/runs',(_req,res)=>res.json({runs}));

const dist = join(here, '../../frontend/dist');
if (existsSync(dist)) {app.use(express.static(dist)); app.get('*', (req,res)=>res.sendFile(join(dist,'index.html')));}
app.use((err,_req,res,_next)=>res.status(400).json({error:err?.message || 'Requisição inválida'}));
const port = Number(process.env.PORT || 3001);
if (process.env.NODE_ENV !== 'test') app.listen(port,()=>console.log(`Invisible Work API em http://localhost:${port}`));
export default app;

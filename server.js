import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { createClient } from '@supabase/supabase-js';

const app=express();
const port=process.env.PORT||3000;
const supabaseAdmin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const razorpay=(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET)
  ? new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET}):null;

app.use(express.json({verify:(req,res,buf)=>{req.rawBody=buf}}));
app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/public/index.html');
});
async function userFromReq(req){
  const auth=req.headers.authorization||'';
  if(!auth.startsWith('Bearer ')) return null;
  const {data:{user}}=await supabaseAdmin.auth.getUser(auth.slice(7));
  return user||null;
}
async function adminFromReq(req){
  const u=await userFromReq(req); if(!u) return null;
  const {data:p}=await supabaseAdmin.from('profiles').select('role').eq('id',u.id).single();
  return p?.role==='admin'?u:null;
}

app.get('/api/config',(req,res)=>res.json({razorpayKeyId:process.env.RAZORPAY_KEY_ID||null}));

app.post('/api/payment/create',async(req,res)=>{
  try{
    
    const {couponId}=req.body;
    const {data:c,error}=await supabaseAdmin.from('coupons').select('*').eq('id',couponId).eq('active',true).single();
    if(error||!c||c.stock<1)return res.status(400).json({error:'Coupon unavailable'});
    if(!razorpay)return res.status(503).json({error:'Razorpay is not configured'});
    const order=await razorpay.orders.create({amount:c.selling_price*100,currency:'INR',receipt:`ch_${Date.now()}`});
    const {data:o,error:oe}=await supabaseAdmin.from('orders').insert({,coupon_id:c.id,amount:c.selling_price,status:'created',razorpay_order_id:order.id}).select().single();
    if(oe)throw oe;
    res.json({orderId:order.id,amount:order.amount,currency:order.currency,dbOrderId:o.id,keyId:process.env.RAZORPAY_KEY_ID});
  }catch(e){console.error(e);res.status(500).json({error:'Unable to create payment'})}
});

app.post('/api/payment/verify',async(req,res)=>{
  try{
    
    const {razorpay_order_id,razorpay_payment_id,razorpay_signature,dbOrderId}=req.body;
    const expected=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if(!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(razorpay_signature)))return res.status(400).json({error:'Invalid signature'});
    const {data:o}=await supabaseAdmin.from('orders').select('*,coupons(*)').eq('id',dbOrderId)..single();
    if(!o)return res.status(404).json({error:'Order not found'});
    if(o.status==='paid')return res.json({ok:true,code:o.coupon_code});
    const code=o.coupons.code;
    await supabaseAdmin.from('orders').update({status:'paid',razorpay_payment_id,coupon_code:code}).eq('id',dbOrderId);
    await supabaseAdmin.from('coupons').update({stock:Math.max(0,o.coupons.stock-1),active:o.coupons.stock>1}).eq('id',o.coupon_id);
    res.json({ok:true,code});
  }catch(e){console.error(e);res.status(500).json({error:'Verification failed'})}
});

app.post('/api/razorpay/webhook',(req,res)=>{
  const secret=process.env.RAZORPAY_WEBHOOK_SECRET;
  if(secret){
    const sig=req.headers['x-razorpay-signature']||'';
    const expected=crypto.createHmac('sha256',secret).update(req.rawBody).digest('hex');
    if(sig!==expected)return res.status(400).send('bad signature');
  }
  res.json({received:true});
});

app.get('/api/admin/stats',async(req,res)=>{
  if(!await adminFromReq(req))return res.status(403).json({error:'Admin only'});
  const [{count:coupons},{count:orders},{data:paid}]=await Promise.all([
    supabaseAdmin.from('coupons').select('*',{count:'exact',head:true}),
    supabaseAdmin.from('orders').select('*',{count:'exact',head:true}),
    supabaseAdmin.from('orders').select('amount').eq('status','paid')
  ]);
  res.json({coupons:coupons||0,orders:orders||0,sales:(paid||[]).reduce((s,x)=>s+x.amount,0)});
});

app.listen(port,()=>console.log(`CouponHub running on http://localhost:${port}`));

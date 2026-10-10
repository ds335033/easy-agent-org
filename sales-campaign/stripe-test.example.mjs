// Server-only sample. Install and PIN Stripe SDK; use test keys only.
import Stripe from 'stripe';
export async function createCheckout({email,contractAccepted,successUrl,cancelUrl}) {
 const key=process.env.STRIPE_SECRET_KEY;
 if(process.env.STRIPE_MODE!=='test'||!key?.startsWith('sk_test_')) throw new Error('Stripe test mode required');
 if(!contractAccepted) throw new Error('Service agreement must be accepted');
 for(const url of [successUrl,cancelUrl]) if(!url?.startsWith('https://')) throw new Error('HTTPS return URLs required');
 const stripe=new Stripe(key);
 const session=await stripe.checkout.sessions.create({mode:'payment',customer_email:email,line_items:[{price_data:{currency:'aud',unit_amount:1000000,product_data:{name:'Easy Agent AI Revenue & Automation Setup'}},quantity:1}],success_url:successUrl,cancel_url:cancelUrl});
 return {id:session.id,url:session.url};
}
export function verifyWebhook(rawBody,signature){
 if(process.env.STRIPE_MODE!=='test'||!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw Error('Test credentials required');
 if(!process.env.STRIPE_WEBHOOK_SECRET) throw Error('Webhook secret required');
 return new Stripe(process.env.STRIPE_SECRET_KEY).webhooks.constructEvent(rawBody,signature,process.env.STRIPE_WEBHOOK_SECRET);
}
// Fulfil ONLY after verifying paid status and processing event IDs idempotently.

const cfg = window.COUPONHUB_CONFIG;
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

let coupons = [];
let selected = null;
let quantity = 1;
const $ = s => document.querySelector(s);

async function load() {
  const { data, error } = await sb
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  coupons = data || [];
  console.log('COUPON DATA:', coupons);
  render();
}

function render() {
  const q = $('#search').value.toLowerCase();

  $('#products').innerHTML =
    coupons
      .filter(c =>
        (c.title + c.brand + c.category)
          .toLowerCase()
          .includes(q)
      )
      .map(c => `
        <article class="card">
          <div class="emoji">🏷️</div>
          <div class="brand">${c.brand} • ${c.category}</div>
          <h3>${c.title}</h3>
          <p>${c.description || ''}</p>
          <div class="price">
            ₹${c.selling_price.toLocaleString('en-IN')}
            <span class="old">
              ₹${c.original_price.toLocaleString('en-IN')}
            </span>
          <div>Stock: ${c.stock}</div>
          <button class="buy" onclick="buy('${c.id}')">
            Buy Coupon
          </button>
        </article>
      `)
      .join('') || '<p>No coupons found.</p>';
}

function buy(id) {
  selected = coupons.find(c => c.id === id);

  if (!selected) return;

  quantity = 1;
  $('#qtyValue').textContent = '1';

  $('#payText').textContent =
    `${selected.title} — ₹${selected.selling_price}`;

  $('#totalText').textContent =
    `Total: ₹${selected.selling_price.toLocaleString('en-IN')}`;

  $('#pay').classList.add('show');
}

async function startPay() {
  if (!selected) return;

  const r = await fetch('/api/payment/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
  couponId: selected.id,
  quantity: quantity,
})
});
  const d = await r.json();

  if (!r.ok) {
    alert(d.error || 'Unable to create payment');
    return;
  }

  if (!window.Razorpay) {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';

    document.head.appendChild(s);

    await new Promise(resolve => {
      s.onload = resolve;
    });
  }

  const rz = new Razorpay({
    key: d.keyId,
    amount: d.amount,
    currency: d.currency,
    name: 'CouponHub',
    description: selected.title,
    order_id: d.orderId,

    handler: async function(resp) {

      const vr = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...resp,
          dbOrderId: d.dbOrderId,
quantity: quantity
        })
      });

      const vd = await vr.json();

      if (vd.ok) {
        hidePay();

        const codes = vd.codes || [vd.code];

const copyText = codes.join('\n');

alert(
  'Payment successful!\n\nYour coupon codes:\n' +
  copyText +
  '\n\n✅ Codes copied automatically!'
);

navigator.clipboard?.writeText(copyText);

load();
      } else {
        alert(vd.error || 'Payment verification failed');
      }
    }
  });

  rz.open();
}

function hidePay() {
  $('#pay').classList.remove('show');
}

$('#payAction').onclick = startPay;
$('#search').oninput = render;
$('#qtyMinus').onclick = () => {
  quantity = Math.max(1, quantity - 1);
  $('#qtyValue').textContent = quantity;
  $('#totalText').textContent =
    `Total: ₹${(selected.selling_price * quantity).toLocaleString('en-IN')}`;
};

$('#qtyPlus').onclick = () => {
  quantity = Math.min(selected.stock, quantity + 1);
  $('#qtyValue').textContent = quantity;
  $('#totalText').textContent =
    `Total: ₹${(selected.selling_price * quantity).toLocaleString('en-IN')}`;
};

sb.channel('public-live')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'coupons'
    },
    () => load()
  )
  .subscribe();

load();

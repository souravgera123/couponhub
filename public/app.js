const cfg = window.COUPONHUB_CONFIG;

const sb = supabase.createClient(
  cfg.SUPABASE_URL,
  cfg.SUPABASE_ANON_KEY
);

let coupons = [];
let selected = null;
let quantity = 1;

const $ = s => document.querySelector(s);


/* ================= LOAD COUPONS ================= */

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


/* ================= RENDER ================= */

function render() {

  const searchEl = $('#search');

  const q = searchEl
    ? searchEl.value.toLowerCase()
    : '';

  $('#products').innerHTML =
    coupons
      .filter(c =>
        (
          (c.title || '') +
          (c.brand || '') +
          (c.category || '')
        )
          .toLowerCase()
          .includes(q)
      )
      .map(c => {

        const selling =
          Number(c.selling_price || 0);

        const original =
          Number(c.original_price || 0);

        const stock =
          Number(c.stock || 0);

        const discount =
          original > selling
            ? Math.round(
                ((original - selling) / original) * 100
              )
            : 0;

        return `
          <article class="card">

            <div class="emoji">
              🏷️
            </div>

            ${
              discount > 0
                ? `<div class="discount">${discount}% OFF</div>`
                : ''
            }

            <div class="brand">
              ${c.brand || ''} • ${c.category || ''}
            </div>

            <h3>
              ${c.title || ''}
            </h3>

            <p>
              ${c.description || ''}
            </p>

            <div class="price">

              ₹${selling.toLocaleString('en-IN')}

              ${
                original > selling
                  ? `
                    <span class="old">
                      ₹${original.toLocaleString('en-IN')}
                    </span>
                  `
                  : ''
              }

              <div>
                Stock: ${stock}
              </div>

            </div>

            <button
              class="buy"
              onclick="buy('${c.id}')"
              ${stock <= 0 ? 'disabled' : ''}
            >
              ${stock > 0 ? 'Buy Coupon' : 'Sold Out'}
            </button>

          </article>
        `;
      })
      .join('') || '<p>No coupons found.</p>';
}


/* ================= BUY ================= */

function buy(id) {

  selected = coupons.find(
    c => c.id === id
  );

  if (!selected) return;

  if (Number(selected.stock) <= 0) {
    alert('Coupon is out of stock.');
    return;
  }

  quantity = 1;

  const qtyInput = $('#qtyInput');
  const qtyValue = $('#qtyValue');

  if (qtyInput) {
    qtyInput.value = 1;
  }

  if (qtyValue) {
    qtyValue.textContent = '1';
  }

  $('#payText').textContent =
    `${selected.title} — ₹${Number(
      selected.selling_price
    ).toLocaleString('en-IN')}`;

  updateTotal();

  $('#pay').classList.add('show');
}


/* ================= QUANTITY ================= */

function updateTotal() {

  if (!selected) return;

  const price =
    Number(selected.selling_price || 0);

  const stock =
    Number(selected.stock || 0);

  quantity = Math.max(
    1,
    Math.min(
      Number(quantity) || 1,
      stock
    )
  );

  const qtyInput = $('#qtyInput');
  const qtyValue = $('#qtyValue');

  if (qtyInput) {
    qtyInput.value = quantity;
  }

  if (qtyValue) {
    qtyValue.textContent = quantity;
  }

  $('#totalText').textContent =
    `Total: ₹${(
      price * quantity
    ).toLocaleString('en-IN')}`;
}


/* ================= MINUS ================= */

$('#qtyMinus').onclick = () => {

  if (!selected) return;

  quantity = Math.max(
    1,
    quantity - 1
  );

  updateTotal();
};


/* ================= PLUS ================= */

$('#qtyPlus').onclick = () => {

  if (!selected) return;

  quantity = Math.min(
    Number(selected.stock),
    quantity + 1
  );

  updateTotal();
};


/* ================= DIRECT QUANTITY INPUT ================= */

const qtyInput = $('#qtyInput');

if (qtyInput) {

  qtyInput.oninput = () => {

    if (!selected) return;

    let value =
      Number(qtyInput.value);

    const stock =
      Number(selected.stock || 0);

    if (!Number.isFinite(value)) {
      value = 1;
    }

    if (value < 1) {
      value = 1;
    }

    if (value > stock) {
      value = stock;
    }

    quantity = value;

    updateTotal();
  };


  qtyInput.onblur = () => {

    if (!selected) return;

    if (
      !qtyInput.value ||
      Number(qtyInput.value) < 1
    ) {
      quantity = 1;
      updateTotal();
    }
  };
}


/* ================= START PAYMENT ================= */

async function startPay() {

  if (!selected) return;

  const stock =
    Number(selected.stock || 0);

  if (stock < 1) {
    alert('Coupon is out of stock.');
    hidePay();
    return;
  }

  quantity = Math.max(
    1,
    Math.min(
      Number(quantity) || 1,
      stock
    )
  );

  updateTotal();


  try {

    const r = await fetch(
      '/api/payment/create',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          couponId: selected.id,
          quantity: quantity
        })
      }
    );


    const d = await r.json();


    if (!r.ok) {

      alert(
        d.error ||
        'Unable to create payment'
      );

      return;
    }


    /* LOAD RAZORPAY */

    if (!window.Razorpay) {

      const s =
        document.createElement('script');

      s.src =
        'https://checkout.razorpay.com/v1/checkout.js';

      document.head.appendChild(s);

      await new Promise(
        resolve => {
          s.onload = resolve;
        }
      );
    }


    /* RAZORPAY */

    const rz =
      new Razorpay({

        key: d.keyId,

        amount: d.amount,

        currency: d.currency,

        name: 'CouponHub',

        description:
          `${selected.title} × ${quantity}`,

        order_id: d.orderId,


        handler: async function(resp) {

          try {

            const vr =
              await fetch(
                '/api/payment/verify',
                {
                  method: 'POST',

                  headers: {
                    'Content-Type':
                      'application/json'
                  },

                  body: JSON.stringify({

                    ...resp,

                    dbOrderId:
                      d.dbOrderId,

                    quantity:
                      quantity

                  })
                }
              );


            const vd =
              await vr.json();


            if (vd.ok) {

              hidePay();


              const codes =
                vd.codes ||
                [vd.code];


              const copyText =
                codes.join('\n');


              /* SUCCESS POPUP */

              const success =
                document.createElement('div');


              success.style.cssText = `
                position:fixed;
                inset:0;
                background:rgba(0,0,0,.72);
                display:flex;
                align-items:center;
                justify-content:center;
                z-index:9999;
                padding:20px;
              `;


              success.innerHTML = `

                <div style="
                  background:#10131a;
                  color:#fff;
                  border:1px solid #397eff;
                  border-radius:20px;
                  padding:24px;
                  max-width:420px;
                  width:100%;
                  text-align:center;
                  box-shadow:0 25px 70px rgba(0,0,0,.7);
                ">

                  <h2>
                    Payment successful! 🎉
                  </h2>

                  <p>
                    Your coupon code${
                      codes.length > 1
                        ? 's'
                        : ''
                    }:
                  </p>

                  <pre
                    id="successCodes"
                    style="
                      white-space:pre-wrap;
                      background:#080b10;
                      color:#8dbbff;
                      padding:14px;
                      border-radius:10px;
                      text-align:left;
                      border:1px solid #252d3b;
                      max-height:250px;
                      overflow:auto;
                    "
                  ></pre>


                  <button
                    id="copyAllCodes"
                    class="buy"
                    type="button"
                  >
                    📋 Copy All Codes
                  </button>


                  <button
                    id="closeSuccess"
                    type="button"
                    style="
                      width:100%;
                      margin-top:8px;
                      padding:11px;
                      border:0;
                      border-radius:10px;
                      color:#aaa;
                      background:#191d25;
                    "
                  >
                    Close
                  </button>

                </div>
              `;


              document.body.appendChild(
                success
              );


              document
                .getElementById(
                  'successCodes'
                )
                .textContent =
                copyText;


              /* COPY ALL */

              document
                .getElementById(
                  'copyAllCodes'
                )
                .onclick =
                async () => {

                  try {

                    await navigator
                      .clipboard
                      .writeText(
                        copyText
                      );


                    document
                      .getElementById(
                        'copyAllCodes'
                      )
                      .textContent =
                      '✅ Copied!';

                  } catch {

                    alert(
                      'Copy failed. Please copy the codes manually.'
                    );
                  }
                };


              /* CLOSE */

              document
                .getElementById(
                  'closeSuccess'
                )
                .onclick = () => {

                  success.remove();

                };


              /* REFRESH STOCK */

              load();


            } else {

              alert(
                vd.error ||
                'Payment verification failed'
              );

            }

          } catch (error) {

            console.error(error);

            alert(
              'Payment verification failed. Please contact support.'
            );

          }

        }

      });


    rz.open();


  } catch (error) {

    console.error(error);

    alert(
      'Something went wrong. Please try again.'
    );

  }
}


/* ================= HIDE PAYMENT ================= */

function hidePay() {

  $('#pay').classList.remove(
    'show'
  );
}


/* ================= BUTTONS ================= */

$('#payAction').onclick =
  startPay;


$('#search').oninput =
  render;


/* ================= LIVE STOCK ================= */

sb.channel('public-live')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'coupons'
    },
    () => {

      load();

      if (
        selected
      ) {

        const fresh =
          coupons.find(
            c =>
              c.id === selected.id
          );

        if (fresh) {

          selected = fresh;

          if (
            quantity >
            Number(fresh.stock)
          ) {

            quantity =
              Number(fresh.stock);

            updateTotal();
          }
        }
      }
    }
  )
  .subscribe();


/* ================= INITIAL LOAD ================= */

load();

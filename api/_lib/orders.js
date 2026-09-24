// Orders: one per checkout attempt. A plan is only extended after PhonePe's
// order-status API says COMPLETED for the exact amount, and only once per order.
const crypto = require('crypto');
const db = require('./db');
const phonepe = require('./phonepe');
const core = require('./core');

const orderKey = (id) => `order:${id}`;
const getOrder = (id) => db.getJSON(orderKey(id));
const saveOrder = (o) => db.setJSON(orderKey(o.id), o);

async function createOrder(user, plan, origin) {
  const settings = await core.getSettings();
  const rupees = Number(settings[plan]);
  if (!core.PLAN_DAYS[plan] || !(rupees > 0)) throw new core.HttpError(400, 'Pick the monthly or yearly plan.');
  const id = `PB${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const order = {
    id,
    phone: user.phone,
    plan,
    amount: Math.round(rupees * 100),
    state: 'CREATED',
    createdAt: Date.now(),
  };
  await saveOrder(order);
  await db.cmd(['ZADD', 'orders', order.createdAt, id]);
  const pay = await phonepe.createPayment({
    merchantOrderId: id,
    amountPaise: order.amount,
    redirectUrl: `${origin}/?paid=${id}#/plan`,
    message: `PakkaBill Pro (${plan})`,
    udf: { udf1: user.phone, udf2: plan },
  });
  order.state = pay.state || 'PENDING';
  order.phonepeOrderId = pay.orderId || '';
  await saveOrder(order);
  if (!pay.redirectUrl) throw new Error(`PhonePe returned no redirectUrl: ${JSON.stringify(pay)}`);
  return { orderId: id, redirectUrl: pay.redirectUrl };
}

// Asks PhonePe for the order's state and applies the plan when it completed.
async function verifyOrder(id) {
  const order = await getOrder(id);
  if (!order) throw new core.HttpError(404, 'Payment not found.');
  if (order.state === 'COMPLETED' && order.appliedAt) return order;
  const st = await phonepe.orderStatus(id);
  const state = st.state || 'PENDING';
  if (state === 'COMPLETED') {
    if (Number(st.amount) !== order.amount) {
      order.state = 'AMOUNT_MISMATCH';
      order.remoteAmount = st.amount;
      await saveOrder(order);
      return order;
    }
    order.state = 'COMPLETED';
    order.paidAt = order.paidAt || Date.now();
    const first = await db.cmd(['SET', `applied:${id}`, '1', 'NX']);
    if (first) {
      const user = await core.getUser(order.phone);
      if (user) {
        core.extend(user, core.PLAN_DAYS[order.plan]);
        user.lastPlan = order.plan;
        await core.saveUser(user);
      }
      order.appliedAt = Date.now();
    }
    await saveOrder(order);
  } else if (state !== order.state) {
    order.state = state;
    await saveOrder(order);
  }
  return order;
}

module.exports = { getOrder, saveOrder, createOrder, verifyOrder };

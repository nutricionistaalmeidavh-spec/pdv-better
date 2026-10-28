import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNexusParityFixture } from './fixtures/nexus-parity.mjs';

test('NEX-P0-01: pagamento misto, troco e 350g conciliam com SQLite apos reabrir', () => {
  const fixture = createNexusParityFixture();
  try {
    let store = fixture.store;
    store.openSession({ openingCashCents: 1000 });
    const input = {
      key: 'nexus-p0-misto-001',
      items: [
        { id: fixture.unit.id, quantityMilli: 2000 },
        { id: fixture.weight.id, quantityMilli: 350 }
      ],
      payments: [
        { method: 'pix', amountCents: 1500 },
        { method: 'cash', amountCents: 2000 }
      ]
    };
    const sale = store.checkout(input);
    assert.equal(sale.total_cents, 2815);
    assert.equal(sale.change_cents, 685);
    assert.equal(sale.payments.find(p => p.method === 'cash').amount_cents, 1315);
    assert.equal(store.getCurrentSession().expected_cash_cents, 2315);
    assert.equal(store.list('products').find(p => p.id === fixture.weight.id).stock_milli, 3650);
    assert.equal(store.checkout(input).id, sale.id, 'reenvio nao cria segunda venda');
    store = fixture.reopen();
    assert.equal(store.getSale(sale.id).total_cents, 2815);
    assert.equal(store.listSales().length, 1);
    assert.equal(store.report().sales_total_cents, 2815);
    assert.equal(store.report().pix_cents, 1500);
    assert.equal(store.report().cash_cents, 1315);
  } finally {
    fixture.cleanup();
  }
});

test('NEX-P0-02: estoque insuficiente e pagamento incompleto nao deixam efeito parcial', () => {
  const fixture = createNexusParityFixture();
  try {
    const store = fixture.store;
    store.openSession({ openingCashCents: 0 });
    const movements = store.listStockMovements().length;
    assert.throws(() => store.checkout({
      key: 'nexus-p0-stock-erro',
      items: [{ id: fixture.unit.id, quantityMilli: 7000 }],
      payments: [{ method: 'cash', amountCents: 10000 }]
    }), /estoque insuficiente/i);
    assert.throws(() => store.checkout({
      key: 'nexus-p0-pay-erro',
      items: [{ id: fixture.unit.id, quantityMilli: 1000 }],
      payments: [{ method: 'pix', amountCents: 100 }]
    }), /pagamento|total|cobrem/i);
    assert.equal(store.listSales().length, 0);
    assert.equal(store.listStockMovements().length, movements);
    assert.equal(store.list('products').find(p => p.id === fixture.unit.id).stock_milli, 6000);
    assert.equal(store.getCurrentSession().expected_cash_cents, 0);
  } finally {
    fixture.cleanup();
  }
});

test('NEX-P0-03: cancelamento reverte estoque e caixa mas nao apaga historico', () => {
  const fixture = createNexusParityFixture();
  try {
    const store = fixture.store;
    store.openSession({ openingCashCents: 0 });
    const sale = store.checkout({
      key: 'nexus-p0-cancel',
      items: [{ id: fixture.weight.id, quantityMilli: 350 }],
      payments: [{ method: 'cash', amountCents: 315 }]
    });
    assert.equal(store.report().sales_total_cents, 315);
    assert.equal(store.cancelSale(sale.id).status, 'cancelled');
    assert.equal(store.listSales().length, 1);
    assert.equal(store.report().sales_total_cents, 0);
    assert.equal(store.report().cancelled_count, 1);
    assert.equal(store.list('products').find(p => p.id === fixture.weight.id).stock_milli, 4000);
    assert.equal(store.getCurrentSession().expected_cash_cents, 0);
    assert.throws(() => store.cancelSale(sale.id), /cancelada/i);
  } finally {
    fixture.cleanup();
  }
});

test('NEX-P0-04: dois caixas mantem saldos independentes e estoque unico', () => {
  const fixture = createNexusParityFixture();
  try {
    const store = fixture.store;
    const a = { terminalId: 'caixa-a' };
    const b = { terminalId: 'caixa-b' };
    store.openSession({ openingCashCents: 500 }, a);
    store.openSession({ openingCashCents: 2000 }, b);
    store.checkout({
      key: 'nexus-p0-caixa-a',
      items: [{ id: fixture.unit.id, quantityMilli: 1000 }],
      payments: [{ method: 'cash', amountCents: 1250 }]
    }, a);
    store.checkout({
      key: 'nexus-p0-caixa-b',
      items: [{ id: fixture.unit.id, quantityMilli: 1000 }],
      payments: [{ method: 'pix', amountCents: 1250 }]
    }, b);
    assert.equal(store.getCurrentSession(a).expected_cash_cents, 1750);
    assert.equal(store.getCurrentSession(b).expected_cash_cents, 2000);
    assert.equal(store.list('products').find(p => p.id === fixture.unit.id).stock_milli, 4000);
    assert.equal(store.listSales().length, 2);
    assert.equal(store.report().sales_total_cents, 2500);
  } finally {
    fixture.cleanup();
  }
});

test('NEX-P0-05: quantidade KG aceita milésimos e UN recusa fração', () => {
  const fixture = createNexusParityFixture();
  try {
    const store = fixture.store;
    store.openSession({ openingCashCents: 0 });
    assert.throws(() => store.checkout({
      key: 'nexus-p0-un-fracionada',
      items: [{ id: fixture.unit.id, quantityMilli: 350 }],
      payments: [{ method: 'cash', amountCents: 500 }]
    }), /inteira/i);
    const sale = store.checkout({
      key: 'nexus-p0-kg-fracionado',
      items: [{ id: fixture.weight.id, quantityMilli: 350 }],
      payments: [{ method: 'pix', amountCents: 315 }]
    });
    assert.equal(sale.items[0].quantity_milli, 350);
    assert.equal(sale.items[0].line_total_cents, 315);
    assert.equal(store.listSales().length, 1);
  } finally {
    fixture.cleanup();
  }
});

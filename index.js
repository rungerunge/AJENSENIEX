require('dotenv').config();
const fetch = require('node-fetch');
const express = require('express');
const app = express();

const SHOP_URL = process.env.SHOPIFY_SHOP_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function fetchOrders() {
    const url = `https://${SHOP_URL}/admin/api/2024-01/orders.json?status=any`;
    const response = await fetch(url, {
        headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
        }
    });
    return await response.json();
}

async function fetchProductMetafield(productId) {
    const url = `https://${SHOP_URL}/admin/api/2024-01/products/${productId}/metafields.json`;
    const response = await fetch(url, {
        headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json'
        }
    });
    const metafields = await response.json();
    return metafields.metafields.find(m => m.namespace === 'sparklayer' && m.key === 'rrp');
}

async function processOrder(order) {
    const orderCurrency = order.currency;
    const processedOrder = {
        orderNumber: order.order_number,
        orderDate: order.created_at,
        isB2B: order.tags.toLowerCase().includes('b2b'),
        currency: orderCurrency,
        items: [],
        totalDiscount: order.total_discounts,
        totalPrice: order.total_price
    };

    for (const item of order.line_items) {
        const metafield = await fetchProductMetafield(item.product_id);
        let beforePrice = null;
        
        if (metafield) {
            try {
                const prices = JSON.parse(metafield.value);
                const currencyPrice = prices.find(p => p.currency_code.toLowerCase() === orderCurrency.toLowerCase());
                if (currencyPrice) {
                    beforePrice = currencyPrice.value;
                }
            } catch (e) {
                console.error('Error parsing metafield value:', e);
            }
        }

        processedOrder.items.push({
            productName: item.title,
            sku: item.sku,
            quantity: item.quantity,
            beforePrice: beforePrice,
            yourPrice: item.price,
            lineItemDiscount: item.total_discount
        });
    }

    return processedOrder;
}

app.get('/orders-feed', async (req, res) => {
    try {
        const { orders } = await fetchOrders();
        const processedOrders = await Promise.all(orders.map(order => processOrder(order)));
        res.json(processedOrders);
    } catch (error) {
        console.error('Error processing orders:', error);
        res.status(500).json({ error: 'Failed to process orders' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 
require('dotenv').config();
const fetch = require('node-fetch');
const express = require('express');
const app = express();

const SHOP_URL = process.env.SHOPIFY_SHOP_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Helper function to format price based on currency
function formatPrice(amount, currency) {
    return parseFloat(amount).toFixed(2);
}

async function fetchOrders() {
    try {
        console.log('Attempting to fetch orders from Shopify...');
        // Include variant_id in line_items
        const url = `https://${SHOP_URL}/admin/api/2024-01/orders.json?status=any&fields=id,order_number,created_at,tags,currency,presentment_currency,total_discounts,total_price,line_items,total_shipping_price_set,total_discounts_set,total_price_set`;
        console.log('Request URL:', url);
        
        const response = await fetch(url, {
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Shopify API Error:', errorText);
            throw new Error(`Shopify API responded with status ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log(`Successfully fetched ${data.orders ? data.orders.length : 0} orders`);
        return data;
    } catch (error) {
        console.error('Error in fetchOrders:', error);
        throw error;
    }
}

async function fetchVariantMetafield(variantId) {
    try {
        console.log(`Fetching metafields for variant ${variantId}...`);
        const metafieldsUrl = `https://${SHOP_URL}/admin/api/2024-01/variants/${variantId}/metafields.json`;
        console.log('Metafields URL:', metafieldsUrl);
        
        const response = await fetch(metafieldsUrl, {
            headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error fetching metafield for variant ${variantId}:`, errorText);
            throw new Error(`Failed to fetch metafield: ${errorText}`);
        }

        const metafields = await response.json();
        console.log(`Received ${metafields.metafields ? metafields.metafields.length : 0} metafields for variant ${variantId}`);
        
        const rrpMetafield = metafields.metafields.find(m => m.namespace === 'sparklayer' && m.key === 'rrp');
        if (rrpMetafield) {
            console.log(`Found RRP metafield for variant ${variantId}:`, rrpMetafield.value);
        } else {
            console.log(`No RRP metafield found for variant ${variantId}`);
        }
        
        return rrpMetafield;
    } catch (error) {
        console.error(`Error fetching metafield for variant ${variantId}:`, error);
        return null;
    }
}

async function processOrder(order) {
    try {
        console.log(`Processing order ${order.order_number}...`);
        const orderCurrency = order.presentment_currency || order.currency;
        console.log(`Order currency: ${orderCurrency}`);
        
        const processedOrder = {
            orderNumber: parseInt(order.order_number),
            orderDate: order.created_at,
            isB2B: order.tags && order.tags.toLowerCase().includes('b2b'),
            currency: orderCurrency,
            items: [],
            totalDiscount: formatPrice(order.total_discounts_set?.presentment_money?.amount || order.total_discounts, orderCurrency),
            totalPrice: formatPrice(order.total_price_set?.presentment_money?.amount || order.total_price, orderCurrency)
        };

        for (const item of order.line_items) {
            console.log(`Processing line item ${item.title} (Variant ID: ${item.variant_id})...`);
            const metafield = await fetchVariantMetafield(item.variant_id);
            let beforePrice = null;
            
            if (metafield) {
                try {
                    console.log(`Parsing metafield value for ${item.title}:`, metafield.value);
                    const prices = JSON.parse(metafield.value);
                    const currencyPrice = prices.find(p => p.currency_code.toLowerCase() === orderCurrency.toLowerCase());
                    if (currencyPrice) {
                        beforePrice = formatPrice(currencyPrice.value, orderCurrency);
                        console.log(`Found before price for ${item.title}: ${beforePrice} ${orderCurrency}`);
                    } else {
                        console.log(`No price found for currency ${orderCurrency} in metafield`);
                    }
                } catch (e) {
                    console.error(`Error parsing metafield value for variant ${item.variant_id}:`, e);
                }
            } else {
                console.log(`No metafield found for variant ${item.variant_id}`);
            }

            processedOrder.items.push({
                productName: item.title,
                sku: item.sku,
                quantity: item.quantity,
                beforePrice: beforePrice,
                yourPrice: formatPrice(item.price_set?.presentment_money?.amount || item.price, orderCurrency),
                lineItemDiscount: formatPrice(item.total_discount_set?.presentment_money?.amount || item.total_discount, orderCurrency)
            });
        }

        console.log(`Successfully processed order ${order.order_number}`);
        return processedOrder;
    } catch (error) {
        console.error(`Error processing order ${order.order_number}:`, error);
        throw error;
    }
}

// Add a basic health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'A.Jensen IEX Integration API is running' });
});

app.get('/orders-feed', async (req, res) => {
    try {
        console.log('Received request for orders feed');
        const data = await fetchOrders();
        
        if (!data.orders) {
            console.error('No orders array in response:', data);
            throw new Error('Invalid response format from Shopify API');
        }

        console.log(`Processing ${data.orders.length} orders...`);
        const processedOrders = await Promise.all(data.orders.map(order => processOrder(order)));
        console.log('Successfully processed all orders');
        res.json(processedOrders);
    } catch (error) {
        console.error('Error in /orders-feed endpoint:', error);
        res.status(500).json({ 
            error: 'Failed to process orders',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Environment check:');
    console.log('SHOP_URL configured:', !!SHOP_URL);
    console.log('ACCESS_TOKEN configured:', !!ACCESS_TOKEN);
}); 
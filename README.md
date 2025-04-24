# A.Jensen IEX Integration

This application creates a feed of Shopify orders formatted for IEX integration, including B2B order handling and price comparisons from product metafields.

## Setup

1. Create a `.env` file in the root directory with the following content:
```
SHOPIFY_SHOP_URL=ajensenflyfishing.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_access_token
SHOPIFY_API_SECRET=your_api_secret
```

2. Install dependencies:
```bash
npm install
```

3. Start the application:
```bash
npm start
```

## Usage

Once the application is running, you can access the order feed at:
```
http://localhost:3000/orders-feed
```

The feed will include:
- Order details (number, date, B2B status)
- Line items with:
  - Before price (from product metafields)
  - Your price (actual paid price)
  - Any applied discounts
- Total order discounts and prices

## Features

- Fetches all orders from Shopify
- Processes B2B orders based on order tags
- Retrieves "Before Price" from product metafields (sparklayer.rrp)
- Handles multiple currency pricing
- Shows line item and order-level discounts 
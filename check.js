const puppeteer = require('puppeteer');
const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const csvWriter = createCsvWriter({
    path: 'orderstatus.csv',
    header: [
        { id: 'orderNumber', title: 'Order Number' },
        { id: 'email', title: 'Email' },
        { id: 'expectedDelivery', title: 'Expected Delivery' },
        { id: 'status', title: 'Status' },
        { id: 'tracking', title: 'Tracking Number'},
        { id: 'productName', title: 'Product Name' },
        { id: 'size', title: 'Size' },
        { id: 'color', title: 'Color' },
        { id: 'productCode', title: 'Product Code' },
        { id: 'address', title: 'Shipping Address' },
    ],
});

async function main() {
    const records = [];

    // Read and parse the CSV file
    await new Promise((resolve, reject) => {
        fs.createReadStream('orders.csv')
            .pipe(csv())
            .on('data', (data) => records.push(data))
            .on('end', resolve)
            .on('error', reject);
    });

    const url = 'https://www.adidas.com/us/order-tracker'; // Replace with your URL
    const submitButton = '.gl-cta.gl-cta--primary.order-tracker__submit___2oWVr'; // Replace with your submit button selector

    let tasks = [...records];
    let failedTasks = [];
    let outputRecords = [];

    while (tasks.length > 0) {
        let task = tasks.shift();

        // Process the chunk
        try {
            // Each record corresponds to a different browser instance
            const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
            const page = await browser.newPage();
            // await page.setViewport({ width: 1250, height: 1080 });

            // Navigate to the page
            await page.goto(url);
            console.log("checking: " + task.orderNo);

            let orderNumber = task.orderNo;
            let email = task.email;

            // Input the values
            await page.type('#order-tracker-page-order-number-field', task.orderNo);  // Assuming your CSV has a column named 'orderNo'
            await page.type('#order-tracker-page-email-field', task.email);  // Assuming your CSV has a column named 'email'

            // Press the button
            await page.click(submitButton);

            // Wait for navigation
            await page.click(submitButton);

            await Promise.all([
                page.waitForNavigation().catch(() => {}),
                page.waitForXPath('//address[@data-auto-id="order-details-address-shipping"]').catch(() => {}),
            ])

            // Get page content and the necessary values
            let expectedDeliveryElement = await page.$x('//div[@data-auto-id="order-shipment-expected-delivery-date-date"]');

            // If the first selector didn't find an element, try the second one
            if (expectedDeliveryElement.length === 0) {
                expectedDeliveryElement = await page.$x('//div[@data-auto-id="order-shipment-delivery-date-date"]');
            }

            // Extract the text
            let expectedDelivery = null;
            if (expectedDeliveryElement.length > 0) {
                expectedDelivery = await page.evaluate(el => el.innerText, expectedDeliveryElement[0]);
            }


            const statusElement = await page.$x('//div[@data-testid="status-label"]');
            const status = statusElement[0] ? await page.evaluate(el => el.innerText, statusElement[0]) : null;

            let hasTracking = true;
            let trackingElement = await page.$x('//p[@class="tracking-description___3iTmt"]');

            // If the first selector didn't find an element, try the second one
            if (trackingElement.length === 0) {
                hasTracking = false;
                trackingElement = await page.$x('//div[@data-auto-id="status-description"]');
            }

            // Extract the text
            let tracking = null;
            if (trackingElement.length > 0) {
                tracking = trackingElement[0] ? await page.evaluate(el => el.innerText, trackingElement[0]) : null;
                if (hasTracking) {
                    tracking = tracking.replace('Tracking number:&nbsp;', '');
                }
            }

            const productNameElement = await page.$x('//h3[@data-auto-id="product-name"]');
            const productName = productNameElement[0] ? await page.evaluate(el => el.innerText, productNameElement[0]) : null;

            const sizeElement = await page.$x('//dl[@data-auto-id="product-attributes"]/dd[@data-auto-id="product-size"]');
            const size = sizeElement[0] ? await page.evaluate(el => el.innerText, sizeElement[0]) : null;

            const colorElement = await page.$x('//dl[@data-auto-id="product-attributes"]/dd[@data-auto-id="product-color"]');
            const color = colorElement[0] ? await page.evaluate(el => el.innerText, colorElement[0]) : null;

            const productCodeElement = await page.$x('//dl[@data-auto-id="product-attributes"]/dd[@data-auto-id="product-code"]');
            const productCode = productCodeElement[0] ? await page.evaluate(el => el.innerText, productCodeElement[0]) : null;

            const addressElement = await page.$x('//address[@data-auto-id="order-details-address-shipping"]');
            const address = addressElement[0] ? await page.evaluate(el => el.innerText, addressElement[0]) : null;



            outputRecords.push({
                orderNumber,
                email,
                expectedDelivery,
                status,
                tracking,
                productName,
                size,
                color,
                productCode,
                address,
            });

            // Close the browser when done
            await browser.close();
        } catch (error) {
            console.log('An error occurred: ', error);
            failedTasks.push(task);
        }

        // Retry failed tasks
        if (tasks.length === 0 && failedTasks.length > 0) {
            console.log(`Retrying ${failedTasks.length} tasks...`)
            tasks = [...failedTasks];
            failedTasks = [];
        }
    }

    // Write to CSV file
    await csvWriter.writeRecords(outputRecords);

    console.log("Done, results in 'orderstatus.csv', upload to excel or google sheets")
}

// Run your async function
main().catch(console.error);

import fs from 'fs';
import path from 'path';

// District arrays from the project
const DISTRICTS = [
  'Bagerhat', 'Bandarban', 'Barguna', 'Barishal', 'Bhola', 'Bogura', 'Brahmanbaria', 'Chandpur',
  'Chattogram', 'Chuadanga', 'Cumilla', "Cox's Bazar", 'Dhaka', 'Dinajpur', 'Faridpur', 'Feni',
  'Gaibandha', 'Gazipur', 'Gopalganj', 'Habiganj', 'Jamalpur', 'Jashore', 'Jhalokathi', 'Jhenaidah',
  'Joypurhat', 'Khagrachhari', 'Khulna', 'Kishoreganj', 'Kurigram', 'Kushtia', 'Lakshmipur',
  'Lalmonirhat', 'Madaripur', 'Magura', 'Manikganj', 'Meherpur', 'Moulvibazar', 'Munshiganj',
  'Mymensingh', 'Naogaon', 'Narail', 'Narayanganj', 'Narsingdi', 'Natore', 'Netrokona',
  'Nilphamari', 'Noakhali', 'Pabna', 'Panchagarh', 'Patuakhali', 'Pirojpur', 'Rajbari', 'Rajshahi',
  'Rangamati', 'Rangpur', 'Satkhira', 'Shariatpur', 'Sherpur', 'Sirajganj', 'Sunamganj', 'Sylhet',
  'Tangail', 'Thakurgaon'
];

const START_YEAR = 2010;
const END_YEAR = 2023; // We won't overwrite 2024 since it has real data
const TEMP_THRESHOLD = 38.0; // Trigger threshold
const HUMIDITY_THRESHOLD = 70.0; // Trigger threshold

const OUT_FILE = './public/data/heatstroke_incidents.csv';

function readExistingCsv() {
    try {
      const data = fs.readFileSync(OUT_FILE, 'utf-8');
      return data.split('\n').filter(l => l.trim().length > 0);
    } catch (e) {
      return ["id,reporting_date,incident_date,district,dead,sick,casualties,place,description,source_name,source_url"];
    }
}

async function main() {
    let lines = readExistingCsv();
    const existingDates = new Set();
    
    // Parse existing dates so we don't accidentally duplicate
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length > 3) {
            existingDates.add(`${parts[2]}-${parts[3]}`); // date-district
        }
    }

    let generatedCount = 0;

    for (let year = START_YEAR; year <= END_YEAR; year++) {
        const yearPath = `./public/data/history/${year}.json`;
        if (!fs.existsSync(yearPath)) {
            console.log(`Skipping ${year} - no data file found.`);
            continue;
        }

        const data = JSON.parse(fs.readFileSync(yearPath, 'utf8'));
        const dates = Object.keys(data).sort();

        for (const date of dates) {
            const dayData = data[date];
            for (const districtName of DISTRICTS) {
                const districtId = districtName.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
                const metrics = dayData[districtId];
                
                if (!metrics) continue;

                // Simple heat index heuristic (feels like)
                // If T > 38 and H > 70, it's incredibly dangerous
                const apparentTemp = metrics.t + 2; // rough estimation used in client
                
                if (apparentTemp >= 41 || (metrics.t >= TEMP_THRESHOLD && metrics.h >= HUMIDITY_THRESHOLD)) {
                    // It's a severe heat event over this district
                    
                    // We don't want to spam every single day of a heatwave with deaths (not realistic),
                    // So we add a random chance based on how hot it is
                    const chance = (metrics.t - 37) * 0.1; // 10% chance per degree over 37
                    
                    if (Math.random() < chance) {
                       const key = `${date}-${districtName}`;
                       if (!existingDates.has(key)) {
                           // Generate an incident
                           const id = Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);
                           const dead = Math.floor(Math.random() * 2) + 1; // 1-2
                           const sick = Math.floor(Math.random() * 5); // 0-4
                           const cas = dead + sick;
                           
                           const desc = `Historical simulated data: Severe heatwave hit ${districtName}, reaching ${metrics.t}°C with ${metrics.h}% humidity.`;
                           
                           lines.push(`${id},${date},${date},${districtName},${dead},${sick},${cas},${districtName},"${desc}",Historical Simulation,https://archive-api.open-meteo.com/`);
                           
                           existingDates.add(key);
                           generatedCount++;
                       }
                    }
                }
            }
        }
    }

    fs.writeFileSync(OUT_FILE, lines.join('\n') + '\n');
    console.log(`Generated ${generatedCount} historical incident records from ${START_YEAR}-${END_YEAR}.`);
}

main().catch(console.error);

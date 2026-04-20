/**
 * Example: How a 3rd party Web Developer would use your model API.
 * 
 * They only need your unique endpoint!
 */

const ENDPOINT = "https://model-7c993f39-3jmcbx25uq-uc.a.run.app/predict";

async function getPrediction() {
    const data = {
        bedrooms: 3.0,
        sqft: 1500.0,
        bathrooms: 2.0,
        year_built: 2010.0,
        distance_to_city_km: 5.5
    };

    console.log("🚀 Sending request to Cloud Run...");

    try {
        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        console.log("✅ Prediction received:", result);
        // Output will be: { "prediction": 246706.12... }
    } catch (error) {
        console.error("❌ Error talking to the model:", error);
    }
}

getPrediction();

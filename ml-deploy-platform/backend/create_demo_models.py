import os

import joblib
import numpy as np
from sklearn.datasets import load_iris
from sklearn.ensemble import GradientBoostingRegressor, RandomForestClassifier
from sklearn.linear_model import LogisticRegression

os.makedirs("../sample_models", exist_ok=True)


# 1) Iris classifier
iris = load_iris()
iris_model = RandomForestClassifier(n_estimators=100, random_state=42)
iris_model.fit(iris.data, iris.target)
iris_model.classes_ = np.array(["Setosa", "Versicolor", "Virginica"])
iris_model.feature_names_in_ = np.array(["sepal_length", "sepal_width", "petal_length", "petal_width"])
joblib.dump(iris_model, "../sample_models/iris_classifier.pkl")
print("Created ../sample_models/iris_classifier.pkl")


# 2) House price regressor
np.random.seed(42)
X = np.column_stack(
    [
        np.random.randint(1, 6, 500),
        np.random.randint(500, 4000, 500),
        np.random.randint(1, 4, 500),
        np.random.randint(1960, 2023, 500),
        np.random.randint(0, 50, 500),
    ]
)
y = (
    X[:, 0] * 50000
    + X[:, 1] * 200
    + X[:, 2] * 30000
    + (X[:, 3] - 1960) * 1000
    - X[:, 4] * 3000
    + np.random.normal(0, 20000, 500)
)

house_model = GradientBoostingRegressor(n_estimators=100, random_state=42)
house_model.fit(X, y)
house_model.feature_names_in_ = np.array(
    ["bedrooms", "sqft", "bathrooms", "year_built", "distance_to_city_km"]
)
joblib.dump(house_model, "../sample_models/house_price_predictor.pkl")
print("Created ../sample_models/house_price_predictor.pkl")


# 3) Churn classifier
np.random.seed(99)
X3 = np.column_stack(
    [
        np.random.randint(1, 60, 600),
        np.random.uniform(10, 200, 600),
        np.random.randint(0, 20, 600),
        np.random.randint(0, 2, 600),
        np.random.uniform(50, 100, 600),
    ]
)
y3 = ((X3[:, 2] > 5) | (X3[:, 1] > 150) | (X3[:, 4] < 60)).astype(int)

churn_model = LogisticRegression(random_state=42, max_iter=1000)
churn_model.fit(X3, y3)
churn_model.feature_names_in_ = np.array(
    ["months_subscribed", "monthly_charge", "support_calls", "has_contract", "satisfaction_score"]
)
joblib.dump(churn_model, "../sample_models/churn_predictor.pkl")
print("Created ../sample_models/churn_predictor.pkl")

print("All demo models generated successfully.")

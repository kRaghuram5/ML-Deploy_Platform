import pickle
import traceback
from typing import Any, Dict

import joblib

SUPPORTED_LIBRARY_PREFIXES = {"sklearn"}


def inspect_model(filepath: str) -> Dict[str, Any]:
    """
    Open a serialized model and extract metadata used to generate inference wrappers.
    For demo reliability we intentionally support sklearn models only.
    """
    result: Dict[str, Any] = {
        "model_type": "unknown",
        "library": "unknown",
        "input_features": [],
        "input_count": None,
        "output_type": "unknown",
        "task_type": "unknown",
        "classes": None,
        "feature_names": None,
        "is_supported": False,
        "support_reason": "Only scikit-learn models are supported in this demo.",
        "error": None,
    }

    try:
        try:
            model = joblib.load(filepath)
        except Exception:
            with open(filepath, "rb") as f:
                model = pickle.load(f)

        result["model_type"] = type(model).__name__
        module_name = type(model).__module__
        result["library"] = module_name.split(".")[0]

        is_supported = any(module_name.startswith(prefix) for prefix in SUPPORTED_LIBRARY_PREFIXES)
        result["is_supported"] = is_supported
        if not is_supported:
            result["support_reason"] = (
                f"Unsupported model type from module '{module_name}'. "
                "Please upload a scikit-learn model serialized with joblib or pickle."
            )

        if hasattr(model, "n_features_in_"):
            result["input_count"] = int(model.n_features_in_)

        if hasattr(model, "feature_names_in_"):
            names = [str(name) for name in model.feature_names_in_]
            result["feature_names"] = names
            result["input_features"] = [{"name": name, "type": "float"} for name in names]
        elif result["input_count"]:
            result["input_features"] = [
                {"name": f"feature_{i}", "type": "float"} for i in range(result["input_count"])
            ]

        if hasattr(model, "classes_"):
            classes = [str(c) for c in model.classes_]
            result["task_type"] = "classification"
            result["classes"] = classes
            result["output_type"] = f"one of {classes}"
        else:
            result["task_type"] = "regression"
            result["output_type"] = "numeric value (float)"

        if hasattr(model, "steps") and model.steps:
            result["model_type"] = f"Pipeline({model.steps[-1][0]})"

    except Exception as exc:
        result["error"] = str(exc)
        result["traceback"] = traceback.format_exc()

    return result

import runpod

from service import RenderRequest, render9


def handler(job):
    try:
        payload = RenderRequest(**(job.get("input") or {}))
        # Runpod already authenticates calls at the endpoint level.
        # DEPTHFLOW_SERVICE_TOKEN should therefore remain unset on the worker.
        return render9(payload, authorization=None)
    except Exception as exc:
        return {"error": str(exc)}


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})

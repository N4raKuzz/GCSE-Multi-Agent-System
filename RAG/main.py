# main.py (FastAPI)
import io
from fastapi import FastAPI, UploadFile, File
from ingest import IngestionPipeline # Move your class to pipeline.py

app = FastAPI()
pipeline = IngestionPipeline()

@app.post("/ingest")
async def ingest_file(file: UploadFile = File(...)):
    # Read the file content into memory
    content = await file.read()
    file_object = io.BytesIO(content)
    
    result = pipeline.ingest_with_gemini(file_object)
    
    return {"status": "success", "data": result}
# main.py (FastAPI)
import io
import uvicorn
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from ingest import IngestionPipeline # Move your class to pipeline.py

app = FastAPI()
pipeline = IngestionPipeline()

#CORS Configuration
origins = [
    "http://localhost:3000", # React/Next.js default
    "http://localhost:5173", # Vite default
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Allows all methods (GET, POST, etc.)
    allow_headers=["*"], # Allows all headers
)

@app.post("/ingest")
async def ingest_file(file: UploadFile = File(...)):
    try:
        # Read the file content into memory
        content = await file.read()
        file_object = io.BytesIO(content)
        result = pipeline.ingest_with_gemini(file_object)
    
        return {"status": "success", "data": result}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
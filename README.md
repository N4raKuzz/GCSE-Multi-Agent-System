# Run and deploy the GSCE Multi-Agent System

The AI GCSE Tutor: A Multi-Agent Knowledge Ecosystem aims to revolutionize secondary education by transforming static textbooks into an interactive, student-centered learning environment.

By leveraging Agentic RAG (Retrieval-Augmented Generation), the system does not just answer questions, it orchestrates a specialized team of AI agents to ensure every response is factually grounded, curriculum-aligned, and pedagogically appropriate for 14-16-year-old students.

## Run Locally

**Prerequisites:**  Node.js

1. Set the Neo4j graph database connection information in [.env](.env). 
   ```
   NEO4J_URI = bolt://localhost:7687  #Example
   NEO4J_USERNAME = neo4j
   NEO4J_PASSWORD = password
   ```
   You can setup on Neo4j website or locally (sees below link)
   https://neo4j.com/docs/operations-manual/current/installation/linux/
 
   Set the `GEMINI_API_KEY` in [.env](.env) to your Gemini API key

2. Create environment and run the ingestion pipeline. 
   In the first terminal:
   ```
   conda env update -f environment.yml
   conda activate gcsekg
   pip install -r requirement
   ```
   Activate the environment and run the FastAPI
   ```
   python RAG/main.py
   ```
   The ingestion pipeline API will be running at `http://localhost:8000/ingest`
   

3. Start the app locally. In the second terminal:
   Install dependencies:
   ```
   npm install
   ```
   Run the app:
   ```npm run dev
   ```

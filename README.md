# Run and deploy the GSCE Multi-Agent System

The AI GCSE Tutor: A Multi-Agent Knowledge Ecosystem aims to revolutionize secondary education by transforming static textbooks into an interactive, student-centered learning environment.

By leveraging Agentic RAG (Retrieval-Augmented Generation), the system does not just "answer questions"—it orchestrates a specialized team of AI agents to ensure every response is factually grounded, curriculum-aligned, and pedagogically appropriate for 14-16-year-old students.

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env](.env) to your Gemini API key
3. Set the Neo4j graph database connection information in [.env](.env). 
   ```
   NEO4J_URI = bolt://localhost:7687  #Example
   NEO4J_USERNAME = neo4j
   NEO4J_PASSWORD = password
   ```
   You can setup on Neo4j website or locally (sees below link)
   https://neo4j.com/docs/operations-manual/current/installation/linux/
4. Run the app:
   `npm run dev`

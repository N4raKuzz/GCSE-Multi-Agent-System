import os
import io
from dotenv import load_dotenv
from docling.document_converter import DocumentConverter
from unstructured.partition.pdf import partition
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_neo4j import Neo4jVector, Neo4jGraph
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from typing import List

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")

# Initialize Gemini Model & Embeddings
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0, api_key=GOOGLE_API_KEY)
embeddings = GoogleGenerativeAIEmbeddings(model="models/text-embedding-004")

class Relationship(BaseModel):
    source: str = Field(description="The subject entity")
    target: str = Field(description="The object entity")
    relation: str = Field(description="The relationship")

class Entity(BaseModel):
    name: str = Field(description="Name of the concept")
    type: str = Field(description="Category")

class KnowledgeGraph(BaseModel):
    entities: List[Entity]
    relationships: List[Relationship]

class IngestionPipeline():

    def __init__(self):

        self.graph = Neo4jGraph(url=NEO4J_URI, username=NEO4J_USERNAME, password=NEO4J_PASSWORD)

        # Extraction Chain
        system_prompt = """
        You are an expert GCSE Curriculum Librarian. Your task is to extract a Knowledge Graph 
        from textbook Markdown text. 

        1. Identify key 'Entities' (Scientific concepts, laws, formulas, or historical figures).
        2. Identify 'Relationship's between them. 
        3. Focus on pedagogical links: 
        - 'PREREQUISITE_FOR' (Concept A is needed to understand Concept B)
        - 'PART_OF' (Mitochondria is part of a Cell)
        - 'RELATES_TO' (Photosynthesis in Bio relates to Energy in Physics)
        - 'PRODUCES' or 'CAUSES'

        Output must be in strict JSON format.
        """

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "Extract the graph from this textbook section: {text}")
        ])

        self.extraction_chain = prompt | llm.with_structured_output(KnowledgeGraph)

    def parse_pdf(self, file):
        
        try:
            # Read the uploaded file into a BytesIO stream
            file_content = file.read()
            file_stream = io.BytesIO(file_content)
            file_stream.seek(0)

            # 'strategy="fast"' -> text-based PDFs. 
            # 'strategy="hi_res"' -> OCR required for scanned images.
            elements = partition(filename=file, strategy="auto")

            pages = set()
            for el in elements:
                p = el.metadata.page_number
                if p: pages.add(p)
                
            print(f"Total elements found: {len(elements)}")
            print(f"Unique pages detected: {sorted(list(pages))}")

            # Join the elements into a single string
            parsed_text = "\n\n".join([str(el) for el in elements])

            # converter = DocumentConverter()
            # parsed_text = converter.convert(file).document.export_to_markdown()

            # with open("./RAG/parsed_pdf.txt", "w", encoding="utf-8") as f:
            #     f.write(parsed_text)

            return parsed_text

        except Exception as e:
            return f"An error occurred during parsing: {str(e)}"

    def ingest_with_gemini(self, input_materials):

        markdown_text = self.parse_pdf(input_materials)
        graph_data = self.extraction_chain.invoke({"text": markdown_text})

        Neo4jVector.from_texts(
            [markdown_text], 
            embeddings, 
            url=NEO4J_URI, 
            username=NEO4J_USERNAME, 
            password=NEO4J_PASSWORD,
            node_label="Chunk"
        )

        for entity in graph_data.entities:
            # Use MERGE to ensure uniqueness based on the concept name
            entity_query = """
            MERGE (e:Concept {name: $name})
            SET e.type = $type
            """
            self.graph.query(entity_query, params={
                "name": entity.name, 
                "type": entity.type
            })
        
        # Insert Relationships
        for rel in graph_data.relationships:
            # This query matches the two existing nodes and creates a relationship between them
            rel_query = """
            MATCH (source:Concept {name: $source_name})
            MATCH (target:Concept {name: $target_name})
            MERGE (source)-[r:RELATED_TO {type: $rel_type}]->(target)
            """
            self.graph.query(rel_query, params={
                "source_name": rel.source,
                "target_name": rel.target,
                "rel_type": rel.relation
            })
            
        print(f"Successfully ingested {len(graph_data.entities)} entities and {len(graph_data.relationships)} relationships.")

        return graph_data
        
if __name__ == "__main__":

    pdf_path = "./Materials/SMC_2025_paper.pdf"
    
    pipeline = IngestionPipeline()
    print(f"--- Starting Ingestion for {pdf_path} ---")
    
    try:
        with open(pdf_path, "rb") as f:
            # The pipeline handles parsing, vectorizing, and graph mapping
            result = pipeline.ingest_with_gemini(pdf_path)
            print(f"Success: {result}")
            
    except FileNotFoundError:
        print(f"Error: The file {pdf_path} was not found.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

    print("--- Knowledge Base Update Complete ---")

    

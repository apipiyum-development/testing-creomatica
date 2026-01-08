from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any
import asyncio
import sys
import os
import json
from dotenv import load_dotenv

# Load environment variables from .env files
load_dotenv('.env.local')
load_dotenv('.env')
load_dotenv('services/.env')

# Log API key availability for debugging
POLZAAI_API_KEY = os.getenv("POLZAAI_API_KEY")
if POLZAAI_API_KEY:
    print(f"POLZAAI_API_KEY loaded successfully: {POLZAAI_API_KEY[:10]}...")
else:
    print("WARNING: POLZAAI_API_KEY not found in environment variables")

# Add the current directory to the path so we can import council module
sys.path.append(os.path.dirname(__file__))

from services.council import run_full_council, format_for_frontend, run_full_council_stream

app = FastAPI(title="LLM Council API", description="API for running LLM council deliberations")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://sovet.creomatica.ru"],  # Production CORS настройки
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],  # Разрешить указанные методы
    allow_headers=["Content-Type", "Authorization"],  # Разрешить указанные заголовки
)

class CouncilRequest(BaseModel):
    query: str

class CouncilResponse(BaseModel):
    opinions: List[Dict[str, str]]
    reviews: List[Dict[str, str]]
    consensus: str

@app.get("/")
async def root():
    return {"message": "LLM Council API is running!"}

@app.post("/council", response_model=CouncilResponse)
async def council_deliberation(request: CouncilRequest):
    try:
        # Run the full council process
        stage1_results, stage2_results, stage3_result, metadata = await run_full_council(request.query)
        
        # Format the results for frontend
        formatted_results = format_for_frontend(stage1_results, stage2_results, stage3_result)
        
        return formatted_results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running council deliberation: {str(e)}")

@app.post("/council/stream")
async def council_deliberation_stream(request: CouncilRequest):
    """
    Streaming version of council deliberation.
    Returns events as they become available via Server-Sent Events.
    """
    query = request.query
    
    async def event_generator():
        try:
            # Stream events from our council functions
            async for event in run_full_council_stream(query):
                # Format as Server-Sent Event
                yield f"data: {json.dumps(event)}\n\n"
            
            # Send final event to indicate completion
            yield f"data: {json.dumps({'stage': 'done', 'status': 'completed'})}\n\n"
            
        except Exception as e:
            # Send error event
            error_event = {
                'stage': 'error',
                'status': 'error',
                'message': str(e)
            }
            yield f"data: {json.dumps(error_event)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "https://sovet.creomatica.ru",
            "Access-Control-Allow-Headers": "Cache-Control"
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
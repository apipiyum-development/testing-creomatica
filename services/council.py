"""3-stage LLM Council orchestration."""

from typing import List, Dict, Any, Tuple, AsyncIterator
from .polzaai import query_models_parallel, query_model
from .config import COUNCIL_MODELS, CHAIRMAN_MODEL


def extract_short_model_name(full_model_name: str) -> str:
    """
    Extract short model name for frontend compatibility.
    
    Args:
        full_model_name: Full model identifier like "google/gemini-3-flash-preview"
        
    Returns:
        Short name like "GEMINI" for frontend
    """
    model_mapping = {
        "google/gemini": "GEMINI",
        "google/gemini-": "GEMINI",
        "openai/gpt": "GPT",
        "openai/": "GPT",
        "x-ai/grok": "GROK",
        "x-ai/": "GROK",
        "anthropic/claude": "CLAUDE",
        "anthropic/": "CLAUDE"
    }
    
    # Find matching prefix
    for prefix, short_name in model_mapping.items():
        if full_model_name.startswith(prefix):
            return short_name
    
    # Fallback: use uppercase first part
    return full_model_name.split('/')[0].upper()


async def stage1_collect_responses(user_query: str) -> List[Dict[str, Any]]:
    """
    Stage 1: Collect individual responses from all council models.

    Args:
        user_query: The user's question

    Returns:
        List of dicts with 'model' and 'response' keys
    """
    messages = [{"role": "user", "content": user_query}]

    # Query all models in parallel
    responses = await query_models_parallel(COUNCIL_MODELS, messages)

    # Format results
    stage1_results = []
    for model, response in responses.items():
        if response is not None:  # Only include successful responses
            stage1_results.append({
                "model": model,
                "response": response.get('content', '')
            })

    return stage1_results


async def stage2_collect_rankings(
    user_query: str,
    stage1_results: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    """
    Stage 2: Each model ranks the anonymized responses.

    Args:
        user_query: The original user query
        stage1_results: Results from Stage 1

    Returns:
        Tuple of (rankings list, label_to_model mapping)
    """
    # Create anonymized labels for responses (Response A, Response B, etc.)
    labels = [chr(65 + i) for i in range(len(stage1_results))]  # A, B, C, ...

    # Create mapping from label to model name
    label_to_model = {
        f"Response {label}": result['model']
        for label, result in zip(labels, stage1_results)
    }

    # Build the ranking prompt
    responses_text = "\n\n".join([
        f"Response {label}:\n{result['response']}"
        for label, result in zip(labels, stage1_results)
    ])

    ranking_prompt = f"""Ты оцениваешь различные ответы на следующий вопрос:
Вопрос: {user_query}

Вот ответы от разных моделей (анонимизированы):

{responses_text}

Твоя задача:
1. Сначала оцени каждый ответ отдельно. Для каждого ответа объясни, что он делает хорошо и что плохо.
2. Затем, в самом конце своего ответа, предоставь финальный рейтинг.

ВАЖНО: Твой финальный рейтинг ДОЛЖЕН быть отформатирован ТОЧНО И СТРОГО следующим образом:
- Начни со строки "ФИНАЛЬНЫЙ РЕЙТИНГ:" (все буквы заглавные, с двоеточием)
- Затем перечисли ответы от лучшего к худшему как нумерованный список
- Каждая строка должна быть: номер, точка, пробел, затем ТОЛЬКО метка ответа (например, "1. Ответ А")
- Не добавляй никакой другой текст или объяснения в разделе рейтинга

Пример правильного формата для ВСЕГО твоего ответа:

Ответ А предоставляет хорошие детали по X, но упускает Y...
Ответ B точен, но не хватает глубины по Z...
Ответ C предлагает наиболее полный ответ...

ФИНАЛЬНЫЙ РЕЙТИНГ:
1. Ответ C
2. Ответ A
3. Ответ B

Теперь предоставь свою оценку и рейтинг:"""

    messages = [{"role": "user", "content": ranking_prompt}]

    # Get rankings from all council models in parallel
    responses = await query_models_parallel(COUNCIL_MODELS, messages)

    # Format results
    stage2_results = []
    for model, response in responses.items():
        if response is not None:
            full_text = response.get('content', '')
            parsed = parse_ranking_from_text(full_text)
            stage2_results.append({
                "model": model,
                "ranking": full_text,
                "parsed_ranking": parsed
            })

    return stage2_results, label_to_model


async def stage3_synthesize_final(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Stage 3: Chairman synthesizes final response.

    Args:
        user_query: The original user query
        stage1_results: Individual model responses from Stage 1
        stage2_results: Rankings from Stage 2

    Returns:
        Dict with 'model' and 'response' keys
    """
    # Build comprehensive context for chairman
    stage1_text = "\n\n".join([
        f"Model: {result['model']}\nResponse: {result['response']}"
        for result in stage1_results
    ])

    stage2_text = "\n\n".join([
        f"Model: {result['model']}\nRanking: {result['ranking']}"
        for result in stage2_results
    ])

    chairman_prompt = f"""Ты — Председатель Совета LLM. Несколько AI-моделей предоставили ответы на вопрос пользователя и затем ранжировали ответы друг друга.

Исходный вопрос: {user_query}

ЭТАП 1 — Индивидуальные ответы:
{stage1_text}

ЭТАП 2 — Взаимное ранжирование:
{stage2_text}

Твоя задача как Председателя — синтезировать всю эту информацию в один единственный, комплексный, точный ответ на исходный вопрос пользователя. Рассмотри:
- Индивидуальные ответы и их инсайты
- Взаимное ранжирование и то, что оно раскрывает о качестве ответов
- Любые паттерны согласия или разногласия

Предоставь чёткий, хорошо аргументированный финальный ответ, который представляет коллективную мудрость совета:"""

    messages = [{"role": "user", "content": chairman_prompt}]

    # Query the chairman model
    response = await query_model(CHAIRMAN_MODEL, messages)

    if response is None:
        # Fallback if chairman fails
        return {
            "model": CHAIRMAN_MODEL,
            "response": "Error: Unable to generate final synthesis."
        }

    return {
        "model": CHAIRMAN_MODEL,
        "response": response.get('content', '')
    }


def parse_ranking_from_text(ranking_text: str) -> List[str]:
    """
    Parse the FINAL RANKING section from the model's response.

    Args:
        ranking_text: The full text response from the model

    Returns:
        List of response labels in ranked order
    """
    import re

    # Look for "FINAL RANKING:" section
    if "FINAL RANKING:" in ranking_text:
        # Extract everything after "FINAL RANKING:"
        parts = ranking_text.split("FINAL RANKING:")
        if len(parts) >= 2:
            ranking_section = parts[1]
            # Try to extract numbered list format (e.g., "1. Response A")
            # This pattern looks for: number, period, optional space, "Response X"
            numbered_matches = re.findall(r'\d+\.\s*Response [A-Z]', ranking_section)
            if numbered_matches:
                # Extract just the "Response X" part
                return [re.search(r'Response [A-Z]', m).group() for m in numbered_matches]

            # Fallback: Extract all "Response X" patterns in order
            matches = re.findall(r'Response [A-Z]', ranking_section)
            return matches

    # Fallback: try to find any "Response X" patterns in order
    matches = re.findall(r'Response [A-Z]', ranking_text)
    return matches


def calculate_aggregate_rankings(
    stage2_results: List[Dict[str, Any]],
    label_to_model: Dict[str, str]
) -> List[Dict[str, Any]]:
    """
    Calculate aggregate rankings across all models.

    Args:
        stage2_results: Rankings from each model
        label_to_model: Mapping from anonymous labels to model names

    Returns:
        List of dicts with model name and average rank, sorted best to worst
    """
    from collections import defaultdict

    # Track positions for each model
    model_positions = defaultdict(list)

    for ranking in stage2_results:
        ranking_text = ranking['ranking']

        # Parse the ranking from the structured format
        parsed_ranking = parse_ranking_from_text(ranking_text)

        for position, label in enumerate(parsed_ranking, start=1):
            if label in label_to_model:
                model_name = label_to_model[label]
                model_positions[model_name].append(position)

    # Calculate average position for each model
    aggregate = []
    for model, positions in model_positions.items():
        if positions:
            avg_rank = sum(positions) / len(positions)
            aggregate.append({
                "model": model,
                "average_rank": round(avg_rank, 2),
                "rankings_count": len(positions)
            })

    # Sort by average rank (lower is better)
    aggregate.sort(key=lambda x: x['average_rank'])

    return aggregate


async def generate_conversation_title(user_query: str) -> str:
    """
    Generate a short title for a conversation based on the first user message.

    Args:
        user_query: The first user message

    Returns:
        A short title (3-5 words)
    """
    title_prompt = f"""Generate a very short title (3-5 words maximum) that summarizes the following question.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Question: {user_query}

Title:"""

    messages = [{"role": "user", "content": title_prompt}]

    # Use gemini-2.5-flash for title generation (fast and cheap)
    response = await query_model("google/gemini-2.5-flash", messages, timeout=30.0)

    if response is None:
        # Fallback to a generic title
        return "New Conversation"

    title = response.get('content', 'New Conversation').strip()

    # Clean up the title - remove quotes, limit length
    title = title.strip('"\'')

    # Truncate if too long
    if len(title) > 50:
        title = title[:47] + "..."

    return title


async def run_full_council(user_query: str) -> Tuple[List, List, Dict, Dict]:
    """
    Run the complete 3-stage council process.

    Args:
        user_query: The user's question

    Returns:
        Tuple of (stage1_results, stage2_results, stage3_result, metadata)
    """
    # Stage 1: Collect individual responses
    stage1_results = await stage1_collect_responses(user_query)

    # If no models responded successfully, return error
    if not stage1_results:
        return [], [], {
            "model": "error",
            "response": "All models failed to respond. Please try again."
        }, {}

    # Stage 2: Collect rankings
    stage2_results, label_to_model = await stage2_collect_rankings(user_query, stage1_results)

    # Calculate aggregate rankings
    aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)

    # Stage 3: Synthesize final answer
    stage3_result = await stage3_synthesize_final(
        user_query,
        stage1_results,
        stage2_results
    )

    # Prepare metadata
    metadata = {
        "label_to_model": label_to_model,
        "aggregate_rankings": aggregate_rankings
    }

    return stage1_results, stage2_results, stage3_result, metadata


def format_for_frontend(
    stage1_results: List[Dict[str, Any]], 
    stage2_results: List[Dict[str, Any]], 
    stage3_result: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Format backend council results to match frontend expectations.
    
    Args:
        stage1_results: Individual model responses from Stage 1
        stage2_results: Rankings from Stage 2  
        stage3_result: Final synthesis from Stage 3
        
    Returns:
        Dict with 'opinions', 'reviews', and 'consensus' keys for frontend
    """
    # Convert stage1_results to opinions format
    opinions = [
        {
            "name": result["model"],
            "content": result["response"]
        }
        for result in stage1_results
    ]
    
    # Convert stage2_results to reviews format
    reviews = [
        {
            "name": result["model"],
            "content": result["ranking"]  # Using the ranking text as the review content
        }
        for result in stage2_results
    ]
    
    # Use the final synthesis as the consensus
    consensus = stage3_result.get("response", "")
    
    return {
        "opinions": opinions,
        "reviews": reviews,
        "consensus": consensus
    }


async def stage1_collect_responses_stream(user_query: str) -> AsyncIterator[Dict[str, Any]]:
    """
    Stage 1: Stream individual responses from all council models.
    
    Args:
        user_query: The user's question
        
    Yields:
        Dict with streaming events for stage 1
    """
    from .polzaai import query_models_stream
    messages = [{"role": "user", "content": user_query}]
    
    # Stream responses from models
    yield {"stage": "stage1", "status": "started"}
    
    async for model, response in query_models_stream(COUNCIL_MODELS, messages):
        if response is not None:  # Only include successful responses
            yield {
                "stage": "stage1",
                "model": extract_short_model_name(model),
                "response": response.get('content', '')
            }
    
    yield {"stage": "stage1", "status": "completed"}


async def stage2_collect_rankings_stream(
    user_query: str,
    stage1_results: List[Dict[str, Any]]
) -> AsyncIterator[Dict[str, Any]]:
    """
    Stage 2: Stream rankings from each model for the anonymized responses.
    
    Args:
        user_query: The original user query
        stage1_results: Results from Stage 1
        
    Yields:
        Dict with streaming events for stage 2
    """
    from .polzaai import query_models_stream
    # Create anonymized labels for responses (Response A, Response B, etc.)
    labels = [chr(65 + i) for i in range(len(stage1_results))]  # A, B, C, ...

    # Create mapping from label to model name
    label_to_model = {
        f"Response {label}": result['model']
        for label, result in zip(labels, stage1_results)
    }

    # Build the ranking prompt
    responses_text = "\n\n".join([
        f"Response {label}:\n{result['response']}"
        for label, result in zip(labels, stage1_results)
    ])

    ranking_prompt = f"""Ты оцениваешь различные ответы на следующий вопрос:
Вопрос: {user_query}

Вот ответы от разных моделей (анонимизированы):

{responses_text}

Твоя задача:
1. Сначала оцени каждый ответ отдельно. Для каждого ответа объясни, что он делает хорошо и что плохо.
2. Затем, в самом конце своего ответа, предоставь финальный рейтинг.

ВАЖНО: Твой финальный рейтинг ДОЛЖЕН быть отформатирован ТОЧНО И СТРОГО следующим образом:
- Начни со строки "ФИНАЛЬНЫЙ РЕЙТИНГ:" (все буквы заглавные, с двоеточием)
- Затем перечисли ответы от лучшего к худшему как нумерованный список
- Каждая строка должна быть: номер, точка, пробел, затем ТОЛЬКО метка ответа (например, "1. Ответ А")
- Не добавляй никакой другой текст или объяснения в разделе рейтинга

Пример правильного формата для ВСЕГО твоего ответа:

Ответ А предоставляет хорошие детали по X, но упускает Y...
Ответ B точен, но не хватает глубины по Z...
Ответ C предлагает наиболее полный ответ...

ФИНАЛЬНЫЙ РЕЙТИНГ:
1. Ответ C
2. Ответ A
3. Ответ B

Теперь предоставь свою оценку и рейтинг:"""

    messages = [{"role": "user", "content": ranking_prompt}]
    
    # Stream rankings from models
    yield {"stage": "stage2", "status": "started"}
    
    async for model, response in query_models_stream(COUNCIL_MODELS, messages):
        if response is not None:
            full_text = response.get('content', '')
            parsed = parse_ranking_from_text(full_text)
            yield {
                "stage": "stage2",
                "model": extract_short_model_name(model),
                "response": full_text  # Using 'response' instead of 'ranking' for consistency with stream
            }
    
    yield {"stage": "stage2", "status": "completed"}


async def stage3_synthesize_final_stream(
    user_query: str,
    stage1_results: List[Dict[str, Any]],
    stage2_results: List[Dict[str, Any]]
) -> AsyncIterator[Dict[str, Any]]:
    """
    Stage 3: Stream chairman's synthesis of the final response.
    
    Args:
        user_query: The original user query
        stage1_results: Individual model responses from Stage 1
        stage2_results: Rankings from Stage 2
        
    Yields:
        Dict with streaming events for stage 3
    """
    from .polzaai import query_model  # Using single query_model for chairman
    # Build comprehensive context for chairman
    stage1_text = "\n\n".join([
        f"Model: {result['model']}\nResponse: {result['response']}"
        for result in stage1_results
    ])

    stage2_text = "\n\n".join([
        f"Model: {result['model']}\nRanking: {result['response']}"  # Using 'response' from stream
        for result in stage2_results
    ])

    chairman_prompt = f"""Ты — Председатель Совета LLM. Несколько AI-моделей предоставили ответы на вопрос пользователя и затем ранжировали ответы друг друга.

Исходный вопрос: {user_query}

ЭТАП 1 — Индивидуальные ответы:
{stage1_text}

ЭТАП 2 — Взаимное ранжирование:
{stage2_text}

Твоя задача как Председателя — синтезировать всю эту информацию в один единственный, комплексный, точный ответ на исходный вопрос пользователя. Рассмотри:
- Индивидуальные ответы и их инсайты
- Взаимное ранжирование и то, что оно раскрывает о качестве ответов
- Любые паттерны согласия или разногласия

Предоставь чёткий, хорошо аргументированный финальный ответ, который представляет коллективную мудрость совета:"""

    messages = [{"role": "user", "content": chairman_prompt}]
    
    # Stream chairman's response
    yield {"stage": "stage3", "status": "started"}
    
    response = await query_model(CHAIRMAN_MODEL, messages)
    
    if response is None:
        # Fallback if chairman fails
        yield {
            "stage": "stage3",
            "response": "Error: Unable to generate final synthesis."
        }
    else:
        yield {
            "stage": "stage3",
            "model": extract_short_model_name(CHAIRMAN_MODEL),
            "response": response.get('content', '')
        }

    yield {"stage": "stage3", "status": "completed"}


async def run_full_council_stream(user_query: str) -> AsyncIterator[Dict[str, Any]]:
    """
    Run the complete 3-stage council process with streaming updates.
    
    Args:
        user_query: The user's question
        
    Yields:
        Dict with streaming events for the entire council process
    """
    # Collect results for stage 2
    stage1_results = []
    
    # Stage 1: Stream individual responses
    async for event in stage1_collect_responses_stream(user_query):
        yield event
        # Collect successful stage 1 results for stage 2
        if event.get("stage") == "stage1" and event.get("model") and event.get("response"):
            stage1_results.append({
                "model": event["model"],
                "response": event["response"]
            })
    
    # If no models responded successfully, return error
    if not stage1_results:
        yield {
            "stage": "error",
            "status": "error",
            "response": "All models failed to respond. Please try again."
        }
        # Don't send done event if there's an error
        return

    # Collect results for stage 3
    stage2_results = []
    
    # Stage 2: Stream rankings
    async for event in stage2_collect_rankings_stream(user_query, stage1_results):
        yield event
        # Collect successful stage 2 results for stage 3
        if event.get("stage") == "stage2" and event.get("model") and event.get("response"):
            stage2_results.append({
                "model": event["model"],
                "response": event["response"]  # Using 'response' from stream
            })

    # Stage 3: Stream final synthesis
    async for event in stage3_synthesize_final_stream(user_query, stage1_results, stage2_results):
        yield event

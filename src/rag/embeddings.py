import numpy as np
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel

DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

_TOKENIZER = None
_MODEL = None
_LOADED_MODEL_NAME = None


def load_embedding_model(model_name=DEFAULT_MODEL):
    global _TOKENIZER, _MODEL, _LOADED_MODEL_NAME

    if _MODEL is not None and _LOADED_MODEL_NAME == model_name:
        return _TOKENIZER, _MODEL

    torch.set_num_threads(min(4, torch.get_num_threads()))

    _TOKENIZER = AutoTokenizer.from_pretrained(model_name)
    _MODEL = AutoModel.from_pretrained(model_name)
    _MODEL.eval()

    _LOADED_MODEL_NAME = model_name

    return _TOKENIZER, _MODEL


def encode_texts(texts, batch_size=32, max_length=128,
                 model_name=DEFAULT_MODEL):
    if isinstance(texts, str):
        texts = [texts]

    if not texts:
        return np.empty((0, 0), dtype=np.float32)

    tokenizer, model = load_embedding_model(model_name)
    all_embeddings = []

    for start in range(0, len(texts), batch_size):
        batch = [str(x) for x in texts[start:start + batch_size]]

        encoded = tokenizer(
            batch,
            padding=True,
            truncation=True,
            max_length=max_length,
            return_tensors="pt"
        )

        with torch.no_grad():
            output = model(**encoded)

            token_embeddings = output.last_hidden_state
            mask = encoded["attention_mask"].unsqueeze(-1)

            summed = (token_embeddings * mask).sum(dim=1)
            counts = mask.sum(dim=1).clamp(min=1)

            pooled = summed / counts
            pooled = F.normalize(pooled, p=2, dim=1)

        all_embeddings.append(
            pooled.cpu().numpy().astype(np.float32)
        )

    return np.vstack(all_embeddings)

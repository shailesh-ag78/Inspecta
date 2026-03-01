"""
LangSmith Configuration and Instrumentation Module
Handles tracing setup, custom tagging, and debugging utilities.
"""

import os
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
os.environ["LANGSMITH_TRACING"] = "false"

from langsmith import Client
from langsmith.wrappers import wrap_openai
from langchain_core.runnables import RunnableConfig

# Configure logging
logger = logging.getLogger(__name__)

class LangSmithConfig:
    """Centralized LangSmith configuration"""
    
    def __init__(self):
        self.api_key = os.getenv("LANGCHAIN_API_KEY") 
        self.project = os.getenv("LANGCHAIN_PROJECT", "inspecta-executor")
        self.tracing_enabled = os.getenv("LANGCHAIN_TRACING_V2", "true").lower() == "true"
        self.log_level = os.getenv("LANGSMITH_LOG_LEVEL", "INFO")
        self.endpoint = os.getenv("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com")
        
        # Setup logging
        logging.basicConfig(level=self.log_level)
        logger.info(f"LangSmith Configuration: project={self.project}, tracing={self.tracing_enabled}")
    
    def get_client(self) -> Optional[Client]:
        """Get LangSmith client for direct API calls"""
        if not self.tracing_enabled or not self.api_key:
            return None
        return Client(api_key=self.api_key, api_url=self.endpoint)
    
    def create_run_config(
        self, 
        thread_id: str,
        incident_id: str,
        company_id: int,
        user_id: Optional[int] = None
    ) -> RunnableConfig:
        """
        Create RunnableConfig with LangSmith tags for better debugging.
        Tags will appear in LangSmith UI for filtering and organization.
        """
        config: RunnableConfig = {
            "configurable": {
                "thread_id": thread_id,
            },
            "tags": [
                "inspecta-executor",
                f"incident:{incident_id}",
                f"company:{company_id}",
            ],
            "metadata": {
                "incident_id": incident_id,
                "company_id": company_id,
                "timestamp": datetime.utcnow().isoformat(),
            }
        }
        
        if user_id:
            config["tags"].append(f"user:{user_id}")
            config["metadata"]["user_id"] = user_id
        
        return config


def setup_langsmith():
    """Initialize LangSmith at application startup"""
    config = LangSmithConfig()
    
    if not config.tracing_enabled:
        logger.warning("⚠️  LangSmith tracing is DISABLED. Set LANGCHAIN_TRACING_V2=true to enable.")
        return config
    
    if not config.api_key:
        logger.warning("⚠️  LANGCHAIN_API_KEY not set. LangSmith tracing will not work.")
        return config
    
    logger.info(f"✅ LangSmith enabled. Project: {config.project}")
    logger.info(f"   Endpoint: {config.endpoint}")
    
    # Optional: Setup OpenAI wrapping if using OpenAI models
    # This automatically traces all OpenAI calls
    # try:
    #     openai_api_key = os.getenv("OPENAI_API_KEY")
    #     if openai_api_key:
    #         wrap_openai()
    #         logger.info("✅ OpenAI tracing enabled")
    # except ImportError:
    #     logger.debug("OpenAI client not available for tracing")
    
    return config


class WorkflowTracer:
    """
    Utility class for manual instrumentation of workflow steps.
    Use this to create custom spans in LangSmith for better visibility.
    """
    
    def __init__(self, client: Optional[Client] = None):
        self.client = client or LangSmithConfig().get_client()
    
    def log_node_execution(
        self,
        node_name: str,
        incident_id: str,
        input_data: Dict[str, Any],
        output_data: Dict[str, Any],
        duration_ms: float,
        error: Optional[Exception] = None
    ):
        """
        Log detailed information about a node execution.
        Useful for debugging stuck workflows or performance issues.
        """
        if not self.client:
            return
        
        status = "error" if error else "success"
        
        log_entry = {
            "node": node_name,
            "incident_id": incident_id,
            "status": status,
            "duration_ms": duration_ms,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "input_keys": list(input_data.keys()),
            "output_keys": list(output_data.keys()),
        }
        
        if error:
            log_entry["error"] = {
                "type": type(error).__name__,
                "message": str(error)
            }
        
        logger.info(f"Node Execution: {log_entry}")
    
    def log_external_agent_call(
        self,
        agent_name: str,
        agent_url: str,
        incident_id: str,
        request_payload: Dict[str, Any],
        response: Optional[Dict[str, Any]] = None,
        error: Optional[Exception] = None,
        duration_ms: float = 0
    ):
        """
        Log external agent API calls for debugging integration issues.
        """
        log_entry = {
            "event": "external_agent_call",
            "agent": agent_name,
            "url": agent_url,
            "incident_id": incident_id,
            "status": "error" if error else "success",
            "duration_ms": duration_ms,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        if error:
            log_entry["error"] = {
                "type": type(error).__name__,
                "message": str(error)
            }
        else:
            log_entry["response_keys"] = list(response.keys()) if response else []
        
        logger.info(f"External Agent Call: {log_entry}")


# Global instance
_langsmith_config: Optional[LangSmithConfig] = None

def get_langsmith_config() -> LangSmithConfig:
    """Get or initialize the global LangSmith config"""
    global _langsmith_config
    if _langsmith_config is None:
        _langsmith_config = setup_langsmith()
    return _langsmith_config

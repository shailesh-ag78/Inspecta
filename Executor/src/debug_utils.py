"""
Debug and Monitoring Utilities for Executor
Provides tools for local debugging, performance monitoring, and LangSmith integration testing.
"""

import logging
import time
import json
from typing import Dict, Any, Callable
from functools import wraps
import asyncio

logger = logging.getLogger(__name__)


class PerformanceMonitor:
    """Monitor workflow performance metrics"""
    
    def __init__(self):
        self.metrics = {}
    
    def record_node_time(self, node_name: str, duration_ms: float):
        """Record node execution time"""
        if node_name not in self.metrics:
            self.metrics[node_name] = {
                "count": 0,
                "total_time": 0,
                "min_time": float('inf'),
                "max_time": 0
            }
        
        stats = self.metrics[node_name]
        stats["count"] += 1
        stats["total_time"] += duration_ms
        stats["min_time"] = min(stats["min_time"], duration_ms)
        stats["max_time"] = max(stats["max_time"], duration_ms)
    
    def get_summary(self) -> Dict[str, Any]:
        """Get performance summary"""
        summary = {}
        for node, stats in self.metrics.items():
            summary[node] = {
                "executions": stats["count"],
                "avg_time_ms": round(stats["total_time"] / stats["count"], 2) if stats["count"] > 0 else 0,
                "min_time_ms": stats["min_time"],
                "max_time_ms": stats["max_time"],
                "total_time_ms": round(stats["total_time"], 2)
            }
        return summary
    
    def print_summary(self):
        """Pretty print performance summary"""
        summary = self.get_summary()
        logger.info("\n" + "="*60)
        logger.info("PERFORMANCE SUMMARY")
        logger.info("="*60)
        for node, stats in summary.items():
            logger.info(f"\n{node}:")
            for key, value in stats.items():
                logger.info(f"  {key}: {value}")


class DebugLogger:
    """Enhanced logging for debugging workflow issues"""
    
    @staticmethod
    def log_state_transition(incident_id: str, from_node: str, to_node: str, state: Dict[str, Any]):
        """Log state transitions for debugging"""
        logger.debug(f"\n{'='*60}")
        logger.debug(f"STATE TRANSITION: {incident_id}")
        logger.debug(f"  From: {from_node} → To: {to_node}")
        logger.debug(f"  State Keys: {list(state.keys())}")
        logger.debug(f"  Audio URL: {bool(state.get('audio_url'))}")
        logger.debug(f"  Transcript Length: {len(state.get('transcript', ''))}")
        logger.debug(f"  Tasks Count: {len(state.get('generated_tasks', []))}")
        logger.debug(f"{'='*60}\n")
    
    @staticmethod
    def log_external_call_detail(agent_name: str, request: Dict, response: Dict = None, error: Exception = None):
        """Log details of external agent calls for debugging"""
        logger.debug(f"\n{'-'*60}")
        logger.debug(f"EXTERNAL AGENT: {agent_name}")
        logger.debug(f"Request:")
        logger.debug(json.dumps({k: v for k, v in request.items() if k != "metadata"}, indent=2))
        
        if response:
            logger.debug(f"Response: {json.dumps(response, indent=2)[:500]}...")  # Truncate long responses
        
        if error:
            logger.debug(f"ERROR: {str(error)}")
        logger.debug(f"{'-'*60}\n")


def async_timer(func: Callable) -> Callable:
    """Decorator to time async functions"""
    @wraps(func)
    async def async_wrapper(*args, **kwargs):
        start = time.time()
        try:
            result = await func(*args, **kwargs)
            duration = (time.time() - start) * 1000
            logger.debug(f"⏱️  {func.__name__} completed in {duration:.2f}ms")
            return result
        except Exception as e:
            duration = (time.time() - start) * 1000
            logger.error(f"❌ {func.__name__} failed after {duration:.2f}ms: {str(e)}")
            raise
    return async_wrapper


def sync_timer(func: Callable) -> Callable:
    """Decorator to time sync functions"""
    @wraps(func)
    def sync_wrapper(*args, **kwargs):
        start = time.time()
        try:
            result = func(*args, **kwargs)
            duration = (time.time() - start) * 1000
            logger.debug(f"⏱️  {func.__name__} completed in {duration:.2f}ms")
            return result
        except Exception as e:
            duration = (time.time() - start) * 1000
            logger.error(f"❌ {func.__name__} failed after {duration:.2f}ms: {str(e)}")
            raise
    return sync_wrapper


class WorkflowDebugger:
    """Interactive debugging utilities for LangGraph workflows"""
    
    def __init__(self, workflow, checkpointer):
        self.workflow = workflow
        self.checkpointer = checkpointer
        self.perf_monitor = PerformanceMonitor()
    
    async def inspect_thread_state(self, thread_id: str, config: Dict):
        """Inspect the current state of a thread"""
        state = await self.workflow.aget_state(config)
        
        logger.info(f"\n{'='*60}")
        logger.info(f"THREAD STATE: {thread_id}")
        logger.info(f"{'='*60}")
        logger.info(f"Current Node: {state.next[0] if state.next else 'COMPLETED'}")
        logger.info(f"Values Keys: {list(state.values.keys())}")
        
        for key, value in state.values.items():
            if isinstance(value, list):
                logger.info(f"  {key}: [{len(value)} items]")
            elif isinstance(value, str):
                logger.info(f"  {key}: {value[:100]}{'...' if len(value) > 100 else ''}")
            else:
                logger.info(f"  {key}: {value}")
        
        logger.info(f"{'='*60}\n")
    
    async def list_checkpoints(self):
        """List all saved checkpoints"""
        logger.info("Recent Checkpoints:")
        # Note: This depends on your checkpointer implementation
        # Adjust based on PostgresSaver's available methods
        try:
            logger.info("(Checkpoint listing depends on PostgresSaver API)")
        except Exception as e:
            logger.warning(f"Could not list checkpoints: {e}")
    
    def print_performance_summary(self):
        """Print workflow performance statistics"""
        self.perf_monitor.print_summary()


# Global instance
_debugger: WorkflowDebugger = None


def initialize_debugger(workflow, checkpointer):
    """Initialize the global debugger instance"""
    global _debugger
    _debugger = WorkflowDebugger(workflow, checkpointer)
    return _debugger


def get_debugger() -> WorkflowDebugger:
    """Get the global debugger instance"""
    if _debugger is None:
        raise RuntimeError("Debugger not initialized. Call initialize_debugger() first.")
    return _debugger

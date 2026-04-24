# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
MarketAnalyzer -- GenLayer Intelligent Contract (v0.1.x Compatible)

Provides AI-powered market analysis for prediction markets.
Users pay native GEN to request an analysis from LLM validators.
Analysis runs through Optimistic Democracy consensus.

Deploy to GenLayer Studio.
"""

from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class AnalysisResult:
    """Storage record for a single analysis. All fields are simple native types."""
    sentiment: str
    confidence: u32
    summary: str
    # Store key_factors as a JSON string to avoid DynArray issues in dataclass
    key_factors_json: str
    risk_level: str
    recommended_action: str
    timestamp: str
    analyst: Address


class MarketAnalyzer(gl.Contract):
    """
    AI Market Analysis contract.
    """

    analyses: TreeMap[u256, AnalysisResult]
    analysis_count: u256
    min_fee: u256

    def __init__(self):
        self.analysis_count = u256(0)
        self.min_fee = u256(1000000000000000000)  # 1 GEN

    @gl.public.write.payable
    def analyze_market(
        self,
        market_question: str,
        market_description: str,
        outcome_names: DynArray[str],
    ):
        fee = gl.message.value
        if fee < self.min_fee:
            raise gl.UserError(
                "Insufficient fee. Sent " + str(fee) + ", minimum required " + str(self.min_fee) + " wei (1 GEN)."
            )

        outcomes_str = ", ".join([str(o) for o in outcome_names])
        prompt = (
            "You are a prediction market analyst. Analyze the following market and respond with a single JSON object.\n\n"
            "MARKET: " + market_question + "\n"
            "DESCRIPTION: " + market_description + "\n"
            "OUTCOMES: " + outcomes_str + "\n\n"
            "Return ONLY a JSON object with exactly these fields:\n"
            '{"sentiment":"bullish"|"bearish"|"neutral","confidence":0-100,"summary":"1-2 sentences","key_factors":["f1","f2","f3"],"risk_level":"low"|"medium"|"high","recommended_action":"1 sentence"}\n'
            "No markdown, no explanations, no code blocks."
        )

        def leader_fn():
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(result, dict):
                raise gl.UserError("LLM did not return a valid JSON object. Got: " + str(type(result)))
            return result

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False

            try:
                my_result = leader_fn()
            except Exception:
                return False

            leader_data = leader_res.calldata
            if not isinstance(leader_data, dict):
                return False
            if not isinstance(my_result, dict):
                return False

            if my_result.get("sentiment") != leader_data.get("sentiment"):
                return False
            if my_result.get("risk_level") != leader_data.get("risk_level"):
                return False

            try:
                my_conf = int(my_result.get("confidence", 0))
                leader_conf = int(leader_data.get("confidence", 0))
                if abs(my_conf - leader_conf) > 10:
                    return False
            except (ValueError, TypeError):
                return False

            return True

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        # Serialize key_factors list to JSON string for storage
        factors = result.get("key_factors", [])
        if isinstance(factors, list):
            key_factors_json = str(factors)
        else:
            key_factors_json = '["Insufficient data for detailed factors."]'

        # CRITICAL: construct with ALL required positional args
        analysis = AnalysisResult(
            sentiment=str(result.get("sentiment", "neutral")),
            confidence=u32(int(result.get("confidence", 50))),
            summary=str(result.get("summary", "Analysis completed.")),
            key_factors_json=key_factors_json,
            risk_level=str(result.get("risk_level", "medium")),
            recommended_action=str(result.get("recommended_action", "Monitor market conditions.")),
            timestamp=str(gl.message_raw.get("datetime", "")),
            analyst=gl.message.sender_address,
        )

        self.analysis_count = u256(int(self.analysis_count) + 1)
        self.analyses[self.analysis_count] = analysis

        return {
            "sentiment": analysis.sentiment,
            "confidence": int(analysis.confidence),
            "summary": analysis.summary,
            "key_factors": key_factors_json,
            "risk_level": analysis.risk_level,
            "recommended_action": analysis.recommended_action,
            "timestamp": analysis.timestamp,
            "analyst": analysis.analyst.as_hex,
        }

    @gl.public.view
    def get_analysis(self, analysis_id: u256):
        if analysis_id == u256(0) or analysis_id > self.analysis_count:
            raise gl.UserError("Analysis not found")
        a = self.analyses[analysis_id]
        return {
            "sentiment": a.sentiment,
            "confidence": int(a.confidence),
            "summary": a.summary,
            "key_factors": a.key_factors_json,
            "risk_level": a.risk_level,
            "recommended_action": a.recommended_action,
            "timestamp": a.timestamp,
            "analyst": a.analyst.as_hex,
        }

    @gl.public.view
    def get_analysis_count(self) -> u256:
        return self.analysis_count

    @gl.public.view
    def get_min_fee(self) -> u256:
        return self.min_fee

    @gl.public.write
    def set_min_fee(self, new_fee: u256) -> None:
        self.min_fee = new_fee

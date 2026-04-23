# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
MarketAnalyzer — GenLayer Intelligent Contract (v0.1.x Compatible)

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
    sentiment: str
    confidence: u32
    summary: str
    key_factors: DynArray[str]
    risk_level: str
    recommended_action: str
    timestamp: str
    analyst: Address


class MarketAnalyzer(gl.Contract):
    """
    AI Market Analysis contract.

    Storage:
        - analyses: TreeMap of analysis_id -> AnalysisResult
        - analysis_count: total number of analyses performed
        - min_fee: minimum GEN fee required (in wei), default 1 GEN
    """

    analyses: TreeMap[u256, AnalysisResult]
    analysis_count: u256
    min_fee: u256

    def __init__(self):
        self.analysis_count = u256(0)
        self.min_fee = u256(1000000000000000000)  # 1 GEN

    # ------------------------------------------------------------------
    # Core: AI-powered market analysis (payable)
    # ------------------------------------------------------------------

    @gl.public.write.payable
    def analyze_market(
        self,
        market_question: str,
        market_description: str,
        outcome_names: DynArray[str],
    ) -> AnalysisResult:
        """
        Request an AI analysis of a prediction market.

        Args:
            market_question: The market's core question
            market_description: Additional context / description
            outcome_names: List of possible outcome names

        Returns:
            AnalysisResult with sentiment, confidence, summary, key_factors,
            risk_level, recommended_action, timestamp, and analyst address.
        """
        fee = gl.message.value
        if fee < self.min_fee:
            raise gl.vm.UserError(
                "Insufficient fee. Sent " + str(fee) + ", minimum required " + str(self.min_fee) + " wei (1 GEN)."
            )

        # Build the structured prompt for the LLM
        outcomes_str = ", ".join([str(o) for o in outcome_names])
        prompt = (
            "You are an elite prediction market analyst with deep expertise in crypto, politics, sports, and macro events.\n\n"
            "Analyze the following prediction market and provide a structured assessment.\n\n"
            "MARKET QUESTION: " + market_question + "\n"
            "DESCRIPTION: " + market_description + "\n"
            "POSSIBLE OUTCOMES: " + outcomes_str + "\n\n"
            "Respond with a single JSON object containing exactly these fields and no other text:\n"
            '{\n'
            '  "sentiment": "bullish" | "bearish" | "neutral",\n'
            '  "confidence": <integer 0-100>,\n'
            '  "summary": "<1-2 sentence market assessment>",\n'
            '  "key_factors": ["<factor 1>", "<factor 2>", "<factor 3>"],\n'
            '  "risk_level": "low" | "medium" | "high",\n'
            '  "recommended_action": "<1 sentence trading recommendation>"\n'
            '}\n\n'
            "Rules:\n"
            "- sentiment MUST be exactly one of: bullish, bearish, neutral\n"
            "- confidence MUST be an integer between 0 and 100\n"
            "- risk_level MUST be exactly one of: low, medium, high\n"
            "- key_factors MUST be an array of 2-4 strings\n"
            "- Output ONLY the JSON object. No markdown formatting, no explanations, no code blocks."
        )

        # Leader function: executes the LLM prompt
        def leader_fn():
            return gl.nondet.exec_prompt(prompt, response_format="json")

        # Validator function: independently re-runs and checks equivalence
        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False

            my_result = leader_fn()

            # Structural validation
            if not isinstance(my_result, dict):
                return False
            if not isinstance(leader_res.calldata, dict):
                return False

            # Must agree on sentiment and risk_level exactly
            if my_result.get("sentiment") != leader_res.calldata.get("sentiment"):
                return False
            if my_result.get("risk_level") != leader_res.calldata.get("risk_level"):
                return False

            # Confidence must be within +/- 10 points
            try:
                my_conf = int(my_result.get("confidence", 0))
                leader_conf = int(leader_res.calldata.get("confidence", 0))
                if abs(my_conf - leader_conf) > 10:
                    return False
            except (ValueError, TypeError):
                return False

            # Summary must be non-empty
            my_summary = str(my_result.get("summary", ""))
            leader_summary = str(leader_res.calldata.get("summary", ""))
            if len(my_summary) < 10 or len(leader_summary) < 10:
                return False

            return True

        # Run non-deterministic consensus
        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        # Build and store the result
        analysis = AnalysisResult()
        analysis.sentiment = str(result.get("sentiment", "neutral"))
        analysis.confidence = u32(int(result.get("confidence", 50)))
        analysis.summary = str(result.get("summary", "Analysis completed."))
        analysis.risk_level = str(result.get("risk_level", "medium"))
        analysis.recommended_action = str(
            result.get("recommended_action", "Monitor market conditions.")
        )
        analysis.timestamp = str(gl.message.raw.datetime)
        analysis.analyst = gl.message.sender_address

        # Handle key factors array
        factors = result.get("key_factors", [])
        analysis.key_factors = DynArray[str]()
        if isinstance(factors, list):
            for f in factors:
                analysis.key_factors.append(str(f))
        else:
            analysis.key_factors.append("Insufficient data for detailed factors.")

        # Increment counter and store
        self.analysis_count = u256(int(self.analysis_count) + 1)
        self.analyses[self.analysis_count] = analysis

        return analysis

    # ------------------------------------------------------------------
    # Views
    # ------------------------------------------------------------------

    @gl.public.view
    def get_analysis(self, analysis_id: u256) -> AnalysisResult:
        """Retrieve a stored analysis by its ID (1-indexed)."""
        if analysis_id == u256(0) or analysis_id > self.analysis_count:
            raise gl.vm.UserError("Analysis not found")
        return self.analyses[analysis_id]

    @gl.public.view
    def get_analysis_count(self) -> u256:
        """Return the total number of analyses performed."""
        return self.analysis_count

    @gl.public.view
    def get_min_fee(self) -> u256:
        """Return the current minimum fee in wei."""
        return self.min_fee

    # ------------------------------------------------------------------
    # Admin
    # ------------------------------------------------------------------

    @gl.public.write
    def set_min_fee(self, new_fee: u256) -> None:
        """Update the minimum analysis fee. Callable by anyone in this demo."""
        self.min_fee = new_fee

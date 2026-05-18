from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class AnalysisResult:
    sentiment: str
    confidence: u32
    summary: str
    key_factors_json: str
    risk_level: str
    recommended_action: str
    timestamp: str
    analyst: Address


@allow_storage
@dataclass
class ResolutionResult:
    market_id: str
    resolved_outcome: str
    outcome_index: u32
    confidence: u32
    reasoning: str
    evidence_json: str
    timestamp: str
    resolver: Address
    is_finalized: bool
    dispute_count: u32


@allow_storage
@dataclass
class DisputeRecord:
    market_id: str
    resolution_id: u256
    challenger: Address
    proposed_outcome: str
    proposed_outcome_index: u32
    evidence: str
    reasoning: str
    timestamp: str
    is_valid: bool
    reviewed: bool


class MarketResolver(gl.Contract):
    analyses: TreeMap[u256, AnalysisResult]
    analysis_count: u256

    resolutions: TreeMap[u256, ResolutionResult]
    resolution_count: u256

    disputes: TreeMap[u256, DisputeRecord]
    dispute_count: u256

    market_resolutions: TreeMap[str, u256]

    min_analysis_fee: u256
    min_resolution_fee: u256
    min_dispute_fee: u256

    owner: Address

    def __init__(self):
        self.analysis_count = u256(0)
        self.resolution_count = u256(0)
        self.dispute_count = u256(0)
        self.min_analysis_fee = u256(1000000000000000000)
        self.min_resolution_fee = u256(2000000000000000000)
        self.min_dispute_fee = u256(500000000000000000)
        self.owner = gl.message.sender_address

    @gl.public.write.payable
    def analyze_market(self, market_question: str, market_description: str, outcome_names: DynArray[str]):
        fee = gl.message.value
        if fee < self.min_analysis_fee:
            raise gl.UserError("Insufficient analysis fee")

        outcome_list = ""
        i = u256(0)
        while i < u256(len(outcome_names)):
            outcome_list = outcome_list + outcome_names[i]
            if i < u256(len(outcome_names)) - u256(1):
                outcome_list = outcome_list + ", "
            i = u256(int(i) + 1)

        prompt = (
            "You are an expert prediction market analyst. "
            "Analyze the following market and provide an informed opinion.\n\n"
            "Question: " + market_question + "\n"
            "Description: " + market_description + "\n"
            "Possible Outcomes: " + outcome_list + "\n\n"
            "Consider current events, historical patterns, expert opinions, and available data. "
            "Provide your analysis in JSON format with these fields:\n"
            "- sentiment: 'bullish', 'bearish', or 'neutral' on the most likely outcome\n"
            "- confidence: 0-100 integer\n"
            "- summary: 2-3 sentence analysis summary\n"
            "- key_factors: array of 3-5 key factors influencing the outcome\n"
            "- risk_level: 'low', 'medium', 'high', or 'extreme'\n"
            "- recommended_action: brief recommendation for market participants"
        )

        def leader_fn():
            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validator_fn(leader_res):
            leader_sentiment = leader_res.get("sentiment", "")
            leader_risk = leader_res.get("risk_level", "")
            leader_confidence = int(leader_res.get("confidence", 50))

            def inner_validator():
                return gl.nondet.exec_prompt(prompt, response_format="json")

            inner_result = gl.vm.run_nondet(inner_validator)
            inner_sentiment = inner_result.get("sentiment", "")
            inner_risk = inner_result.get("risk_level", "")
            inner_confidence = int(inner_result.get("confidence", 50))

            sentiment_match = leader_sentiment == inner_sentiment
            risk_match = leader_risk == inner_risk
            confidence_close = abs(leader_confidence - inner_confidence) <= 10

            return sentiment_match and risk_match and confidence_close

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        factors = result.get("key_factors", [])
        key_factors_json = str(factors) if isinstance(factors, list) else '[]'

        analysis = AnalysisResult(
            sentiment=str(result.get("sentiment", "neutral")),
            confidence=u32(int(result.get("confidence", 50))),
            summary=str(result.get("summary", "")),
            key_factors_json=key_factors_json,
            risk_level=str(result.get("risk_level", "medium")),
            recommended_action=str(result.get("recommended_action", "")),
            timestamp=str(gl.message_raw.get("datetime", "")),
            analyst=gl.message.sender_address,
        )

        self.analysis_count = u256(int(self.analysis_count) + 1)
        self.analyses[self.analysis_count] = analysis

    @gl.public.write.payable
    def resolve_market(self, market_id: str, question: str, description: str, outcome_names: DynArray[str]):
        fee = gl.message.value
        if fee < self.min_resolution_fee:
            raise gl.UserError("Insufficient resolution fee")

        existing = self.market_resolutions.get(market_id, u256(0))
        if existing != u256(0):
            existing_res = self.resolutions.get(existing)
            if existing_res is not None and existing_res.is_finalized:
                raise gl.UserError("Market already resolved")

        outcome_list = ""
        i = u256(0)
        while i < u256(len(outcome_names)):
            outcome_list = outcome_list + outcome_names[i]
            if i < u256(len(outcome_names)) - u256(1):
                outcome_list = outcome_list + ", "
            i = u256(int(i) + 1)

        prompt = (
            "You are an impartial market resolver. Your task is to determine the OUTCOME of this prediction market "
            "based on available evidence and real-world facts.\n\n"
            "Market ID: " + market_id + "\n"
            "Question: " + question + "\n"
            "Description: " + description + "\n"
            "Possible Outcomes: " + outcome_list + "\n\n"
            "Research the current state of affairs and determine which outcome has occurred. "
            "You MUST pick exactly ONE outcome from the list above.\n\n"
            "Return your resolution in JSON format with these fields:\n"
            "- resolved_outcome: the exact name of the winning outcome from the list\n"
            "- outcome_index: the 0-based index of the winning outcome\n"
            "- confidence: 0-100 integer representing certainty\n"
            "- reasoning: detailed explanation of why this outcome is correct\n"
            "- evidence: array of 2-4 specific evidence points (URLs, facts, data)"
        )

        def leader_fn():
            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validator_fn(leader_res):
            leader_outcome = leader_res.get("resolved_outcome", "")
            leader_index = int(leader_res.get("outcome_index", -1))

            def inner_validator():
                return gl.nondet.exec_prompt(prompt, response_format="json")

            inner_result = gl.vm.run_nondet(inner_validator)
            inner_outcome = inner_result.get("resolved_outcome", "")
            inner_index = int(inner_result.get("outcome_index", -1))

            return leader_outcome == inner_outcome and leader_index == inner_index

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        evidence = result.get("evidence", [])
        evidence_json = str(evidence) if isinstance(evidence, list) else '[]'

        self.resolution_count = u256(int(self.resolution_count) + 1)
        resolution_id = self.resolution_count

        resolution = ResolutionResult(
            market_id=market_id,
            resolved_outcome=str(result.get("resolved_outcome", "")),
            outcome_index=u32(int(result.get("outcome_index", 0))),
            confidence=u32(int(result.get("confidence", 50))),
            reasoning=str(result.get("reasoning", "")),
            evidence_json=evidence_json,
            timestamp=str(gl.message_raw.get("datetime", "")),
            resolver=gl.message.sender_address,
            is_finalized=False,
            dispute_count=u32(0),
        )

        self.resolutions[resolution_id] = resolution
        self.market_resolutions[market_id] = resolution_id

    @gl.public.write.payable
    def dispute_resolution(self, resolution_id: u256, market_id: str, outcome_names: DynArray[str]):
        fee = gl.message.value
        if fee < self.min_dispute_fee:
            raise gl.UserError("Insufficient dispute fee")

        if resolution_id == u256(0) or resolution_id > self.resolution_count:
            raise gl.UserError("Invalid resolution ID")

        resolution = self.resolutions.get(resolution_id)
        if resolution is None:
            raise gl.UserError("Resolution not found")

        if resolution.is_finalized:
            raise gl.UserError("Resolution is already finalized, cannot dispute")

        if resolution.market_id != market_id:
            raise gl.UserError("Resolution ID does not match market ID")

        prompt = (
            "A dispute has been filed against a market resolution. Review the dispute and determine if it is valid.\n\n"
            "Market ID: " + market_id + "\n"
            "Original Resolution ID: " + str(int(resolution_id)) + "\n"
            "Original Outcome: " + resolution.resolved_outcome + "\n"
            "Possible Outcomes: "
        )

        i = u256(0)
        while i < u256(len(outcome_names)):
            prompt = prompt + outcome_names[i]
            if i < u256(len(outcome_names)) - u256(1):
                prompt = prompt + ", "
            i = u256(int(i) + 1)

        prompt = prompt + (
            "\n\n"
            "The challenger believes a different outcome is correct. "
            "Review the evidence and reasoning carefully.\n\n"
            "Return your judgment in JSON format:\n"
            "- is_valid: true if the dispute has merit, false otherwise\n"
            "- correct_outcome: the outcome you believe is correct\n"
            "- correct_outcome_index: 0-based index of the correct outcome\n"
            "- reasoning: explanation of your judgment\n"
            "- key_evidence: array of 2-3 key evidence points"
        )

        def leader_fn():
            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validator_fn(leader_res):
            leader_valid = leader_res.get("is_valid", False)
            leader_outcome = leader_res.get("correct_outcome", "")

            def inner_validator():
                return gl.nondet.exec_prompt(prompt, response_format="json")

            inner_result = gl.vm.run_nondet(inner_validator)
            inner_valid = inner_result.get("is_valid", False)
            inner_outcome = inner_result.get("correct_outcome", "")

            return leader_valid == inner_valid and leader_outcome == inner_outcome

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        is_valid = bool(result.get("is_valid", False))

        self.dispute_count = u256(int(self.dispute_count) + 1)
        dispute_id = self.dispute_count

        dispute = DisputeRecord(
            market_id=market_id,
            resolution_id=resolution_id,
            challenger=gl.message.sender_address,
            proposed_outcome=str(result.get("correct_outcome", "")),
            proposed_outcome_index=u32(int(result.get("correct_outcome_index", 0))),
            evidence=str(result.get("key_evidence", [])),
            reasoning=str(result.get("reasoning", "")),
            timestamp=str(gl.message_raw.get("datetime", "")),
            is_valid=is_valid,
            reviewed=True,
        )

        self.disputes[dispute_id] = dispute

        resolution.dispute_count = u32(int(resolution.dispute_count) + 1)

        if is_valid:
            resolution.resolved_outcome = dispute.proposed_outcome
            resolution.outcome_index = dispute.proposed_outcome_index
            resolution.is_finalized = True
            self.resolutions[resolution_id] = resolution
        else:
            resolution.is_finalized = True
            self.resolutions[resolution_id] = resolution

    @gl.public.write
    def finalize_resolution(self, resolution_id: u256):
        if resolution_id == u256(0) or resolution_id > self.resolution_count:
            raise gl.UserError("Invalid resolution ID")

        resolution = self.resolutions.get(resolution_id)
        if resolution is None:
            raise gl.UserError("Resolution not found")

        if resolution.is_finalized:
            raise gl.UserError("Resolution already finalized")

        if gl.message.sender_address != self.owner:
            raise gl.UserError("Only owner can finalize resolutions")

        resolution.is_finalized = True
        self.resolutions[resolution_id] = resolution

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
    def get_resolution(self, resolution_id: u256):
        if resolution_id == u256(0) or resolution_id > self.resolution_count:
            raise gl.UserError("Resolution not found")
        r = self.resolutions[resolution_id]
        return {
            "market_id": r.market_id,
            "resolved_outcome": r.resolved_outcome,
            "outcome_index": int(r.outcome_index),
            "confidence": int(r.confidence),
            "reasoning": r.reasoning,
            "evidence": r.evidence_json,
            "timestamp": r.timestamp,
            "resolver": r.resolver.as_hex,
            "is_finalized": r.is_finalized,
            "dispute_count": int(r.dispute_count),
        }

    @gl.public.view
    def get_resolution_by_market(self, market_id: str):
        resolution_id = self.market_resolutions.get(market_id, u256(0))
        if resolution_id == u256(0):
            return None
        return self.get_resolution(resolution_id)

    @gl.public.view
    def get_dispute(self, dispute_id: u256):
        if dispute_id == u256(0) or dispute_id > self.dispute_count:
            raise gl.UserError("Dispute not found")
        d = self.disputes[dispute_id]
        return {
            "market_id": d.market_id,
            "resolution_id": int(d.resolution_id),
            "challenger": d.challenger.as_hex,
            "proposed_outcome": d.proposed_outcome,
            "proposed_outcome_index": int(d.proposed_outcome_index),
            "evidence": d.evidence,
            "reasoning": d.reasoning,
            "timestamp": d.timestamp,
            "is_valid": d.is_valid,
            "reviewed": d.reviewed,
        }

    @gl.public.view
    def get_analysis_count(self):
        return int(self.analysis_count)

    @gl.public.view
    def get_resolution_count(self):
        return int(self.resolution_count)

    @gl.public.view
    def get_dispute_count(self):
        return int(self.dispute_count)

    @gl.public.view
    def get_min_analysis_fee(self):
        return int(self.min_analysis_fee)

    @gl.public.view
    def get_min_resolution_fee(self):
        return int(self.min_resolution_fee)

    @gl.public.view
    def get_min_dispute_fee(self):
        return int(self.min_dispute_fee)

    @gl.public.write
    def set_min_analysis_fee(self, new_fee: u256):
        if gl.message.sender_address != self.owner:
            raise gl.UserError("Only owner can change fees")
        self.min_analysis_fee = new_fee

    @gl.public.write
    def set_min_resolution_fee(self, new_fee: u256):
        if gl.message.sender_address != self.owner:
            raise gl.UserError("Only owner can change fees")
        self.min_resolution_fee = new_fee

    @gl.public.write
    def set_min_dispute_fee(self, new_fee: u256):
        if gl.message.sender_address != self.owner:
            raise gl.UserError("Only owner can change fees")
        self.min_dispute_fee = new_fee

# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class Market:
    market_id: str
    question: str
    outcomes: str
    outcome_count: u32
    end_date: str
    is_active: bool
    is_resolved: bool
    resolved_outcome_index: u32
    total_pool: u256


@allow_storage
@dataclass
class Stake:
    user: Address
    outcome_index: u32
    amount: u256
    claimed: bool


class PredictMarket(gl.Contract):
    markets: TreeMap[str, Market]
    stakes: TreeMap[str, Stake]
    pool_totals: TreeMap[str, u256]
    min_stake: u256
    owner: Address

    def __init__(self):
        self.min_stake = u256(1000000000000000)  # 0.001 GEN
        self.owner = gl.message.sender_address

    def _stake_key(self, market_id: str, user: Address, outcome_index: u32) -> str:
        return f"{market_id}:{user.as_hex}:{int(outcome_index)}"

    def _pool_key(self, market_id: str, outcome_index: u32) -> str:
        return f"{market_id}:{int(outcome_index)}"

    @gl.public.write
    def register_market(
        self,
        market_id: str,
        question: str,
        outcomes_str: str,
        end_date: str,
    ) -> None:
        existing = self.markets.get(market_id)
        if existing is not None:
            return

        outcomes = [o.strip() for o in outcomes_str.split(",") if o.strip()]
        if len(outcomes) < 2:
            raise gl.UserError("Market must have at least 2 outcomes")

        self.markets[market_id] = Market(
            market_id=market_id,
            question=question,
            outcomes=outcomes_str,
            outcome_count=u32(len(outcomes)),
            end_date=end_date,
            is_active=True,
            is_resolved=False,
            resolved_outcome_index=u32(0),
            total_pool=u256(0),
        )

    @gl.public.write.payable
    def stake(
        self,
        market_id: str,
        question: str,
        outcomes_str: str,
        end_date: str,
        outcome_index: u32,
    ) -> None:
        amount = gl.message.value

        # Auto-register market if not exists
        market = self.markets.get(market_id)
        if market is None:
            outcomes = [o.strip() for o in outcomes_str.split(",") if o.strip()]
            if len(outcomes) < 2:
                raise gl.UserError("Market must have at least 2 outcomes")
            if outcome_index >= u32(len(outcomes)):
                raise gl.UserError("Invalid outcome index")

            market = Market(
                market_id=market_id,
                question=question,
                outcomes=outcomes_str,
                outcome_count=u32(len(outcomes)),
                end_date=end_date,
                is_active=True,
                is_resolved=False,
                resolved_outcome_index=u32(0),
                total_pool=u256(0),
            )
            self.markets[market_id] = market

        if not market.is_active:
            raise gl.UserError("Market is not active")
        if market.is_resolved:
            raise gl.UserError("Market is already resolved")
        if outcome_index >= market.outcome_count:
            raise gl.UserError("Invalid outcome index")
        if amount < self.min_stake:
            raise gl.UserError("Stake amount too small")

        sender = gl.message.sender_address
        stake_key = self._stake_key(market_id, sender, outcome_index)
        pool_key = self._pool_key(market_id, outcome_index)

        existing = self.stakes.get(stake_key)
        if existing is not None:
            existing.amount += amount
        else:
            self.stakes[stake_key] = Stake(
                user=sender,
                outcome_index=outcome_index,
                amount=amount,
                claimed=False,
            )

        current_total = self.pool_totals.get(pool_key, u256(0))
        self.pool_totals[pool_key] = current_total + amount
        market.total_pool += amount
        self.markets[market_id] = market

    @gl.public.write
    def resolve_market(self, market_id: str, outcome_index: u32) -> None:
        if gl.message.sender_address != self.owner:
            raise gl.UserError("Only owner can resolve markets")
        if market_id not in self.markets:
            raise gl.UserError("Market not found")

        market = self.markets[market_id]
        if market.is_resolved:
            raise gl.UserError("Market already resolved")
        if outcome_index >= market.outcome_count:
            raise gl.UserError("Invalid outcome index")

        market.is_resolved = True
        market.resolved_outcome_index = outcome_index
        self.markets[market_id] = market

    @gl.public.write
    def claim_winnings(self, market_id: str) -> u256:
        if market_id not in self.markets:
            raise gl.UserError("Market not found")

        market = self.markets[market_id]
        if not market.is_resolved:
            raise gl.UserError("Market not resolved yet")

        sender = gl.message.sender_address
        stake_key = self._stake_key(market_id, sender, market.resolved_outcome_index)

        stake = self.stakes.get(stake_key)
        if stake is None:
            raise gl.UserError("No stake on winning outcome")
        if stake.claimed:
            raise gl.UserError("Winnings already claimed")

        winning_pool = self.pool_totals.get(
            self._pool_key(market_id, market.resolved_outcome_index), u256(0)
        )

        winnings = u256(0)
        if winning_pool > 0:
            winnings = (stake.amount * market.total_pool) // winning_pool
        else:
            winnings = stake.amount

        stake.claimed = True
        self.stakes[stake_key] = stake

        if winnings > 0:
            if self.balance < winnings:
                raise gl.UserError("Contract balance insufficient")
            _Recipient(sender).emit_transfer(value=winnings)

        return winnings

    @gl.public.view
    def get_market(self, market_id: str) -> dict:
        m = self.markets.get(market_id)
        if m is None:
            return None
        return {
            "market_id": m.market_id,
            "question": m.question,
            "outcomes": m.outcomes,
            "outcome_count": int(m.outcome_count),
            "end_date": m.end_date,
            "is_active": m.is_active,
            "is_resolved": m.is_resolved,
            "resolved_outcome_index": int(m.resolved_outcome_index),
            "total_pool": int(m.total_pool),
        }

    @gl.public.view
    def get_all_pools(self, market_id: str) -> list:
        m = self.markets.get(market_id)
        if m is None:
            return []

        pools = []
        i = u32(0)
        while i < m.outcome_count:
            key = self._pool_key(market_id, i)
            amount = self.pool_totals.get(key, u256(0))
            pools.append({
                "outcome_index": int(i),
                "amount": int(amount),
            })
            i = u32(int(i) + 1)
        return pools

    @gl.public.view
    def get_user_stakes(self, market_id: str, user: Address) -> list:
        m = self.markets.get(market_id)
        if m is None:
            return []

        stakes = []
        i = u32(0)
        while i < m.outcome_count:
            key = self._stake_key(market_id, user, i)
            stake = self.stakes.get(key)
            if stake is not None and int(stake.amount) > 0:
                stakes.append({
                    "market_id": market_id,
                    "user": stake.user.as_hex,
                    "outcome_index": int(stake.outcome_index),
                    "amount": int(stake.amount),
                })
            i = u32(int(i) + 1)
        return stakes

    @gl.public.view
    def get_contract_balance(self) -> int:
        return int(self.balance)


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass
    class Write:
        pass

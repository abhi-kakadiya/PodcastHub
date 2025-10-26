from typing import Any, Dict, Generic, List, Optional, Type, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import joinedload
from sqlalchemy.sql import and_, asc, desc, func

from core.database import Base

T = TypeVar("T", bound=Base)  # type: ignore


class BaseRepository(Generic[T]):
    def __init__(self, session: AsyncSession, model: Type[T]) -> None:
        self.session = session
        self.model = model

    async def get_by_id(
        self, obj_id: str, joins: Optional[List[Any]] = None
    ) -> Optional[T]:
        """Get a record by primary key with optional joins."""
        query = select(self.model).where(self.model.uuid == obj_id)

        if joins:
            for join in joins:
                query = query.options(joinedload(join))

        result = await self.session.execute(query)
        return result.unique().scalar_one_or_none()

    async def get_by_field(
        self, field: str, value: Any, joins: Optional[List[Any]] = None
    ) -> Optional[T]:
        """Get a single record by a field value with optional joins."""
        query = select(self.model).where(getattr(self.model, field) == value)

        if joins:
            for join in joins:
                query = query.options(joinedload(join))

        result = await self.session.execute(query)
        return result.unique().scalar_one_or_none()

    async def get_many_by_field(
        self,
        field: str,
        value: Any,
        joins: Optional[List[Any]] = None,
        order_by: Optional[str] = None,
        descending: bool = False,
    ) -> List[T]:
        """Get multiple records by a field value with optional joins and sorting."""
        query = select(self.model).where(getattr(self.model, field) == value)

        if joins:
            for join in joins:
                query = query.options(joinedload(join))

        if order_by:
            query = query.order_by(
                desc(getattr(self.model, order_by))
                if descending
                else asc(getattr(self.model, order_by))
            )

        result = await self.session.execute(query)
        return result.scalars().all()

    # NEW
    async def get_by_many_fields(
        self,
        filters: Dict[str, Any],  # Dictionary of field-value pairs
        joins: Optional[List[Any]] = None,
        order_by: Optional[str] = None,
        descending: bool = False,
    ) -> Optional[T]:
        """Get single record filtered by multiple fields with optional joins and sorting."""
        query = select(self.model).where(
            and_(
                *(
                    getattr(self.model, field) == value
                    for field, value in filters.items()
                )
            )
        )

        if joins:
            for join in joins:
                query = query.options(joinedload(join))

        if order_by:
            query = query.order_by(
                desc(getattr(self.model, order_by))
                if descending
                else asc(getattr(self.model, order_by))
            )

        result = await self.session.execute(query)
        return result.unique().scalar_one_or_none()

    async def get_many_by_fields(
        self,
        filters: Dict[str, Any],  # Dictionary of field-value pairs
        joins: Optional[List[Any]] = None,
        order_by: Optional[str] = None,
        descending: bool = False,
    ) -> List[T]:
        """Get multiple records filtered by multiple fields with optional joins and sorting."""
        query = select(self.model).where(
            and_(
                *(
                    getattr(self.model, field) == value
                    for field, value in filters.items()
                )
            )
        )

        if joins:
            for join in joins:
                query = query.options(joinedload(join))

        if order_by:
            query = query.order_by(
                desc(getattr(self.model, order_by))
                if descending
                else asc(getattr(self.model, order_by))
            )

        result = await self.session.execute(query)
        return result.unique().scalars().all()

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 100,
        joins: Optional[List[Any]] = None,
        order_by: Optional[str] = None,
        descending: bool = False,
    ) -> List[T]:
        """Get all records with optional joins and sorting."""
        query = select(self.model)

        if joins:
            for join in joins:
                query = query.options(joinedload(join))

        if order_by:
            query = query.order_by(
                desc(getattr(self.model, order_by))
                if descending
                else asc(getattr(self.model, order_by))
            )

        query = query.offset(skip).limit(limit)

        result = await self.session.execute(query)
        return result.unique().scalars().all()

    async def count_by_field(
        self, field: Optional[str] = None, value: Any = None
    ) -> int:
        """Count the number of records, optionally filtering by a field."""
        query = select(func.count()).select_from(self.model)

        if field and value is not None:
            query = query.where(getattr(self.model, field) == value)

        result = await self.session.execute(query)
        return result.scalar_one()

    async def sum_by_field(
        self, field: str, filter_field: Optional[str] = None, filter_value: Any = None
    ) -> Optional[float]:
        """Sum a numeric column, optionally filtering by another field."""
        query = select(func.sum(getattr(self.model, field))).select_from(self.model)

        if filter_field and filter_value is not None:
            query = query.where(getattr(self.model, filter_field) == filter_value)

        result = await self.session.execute(query)
        return result.scalar_one()

    async def create(self, obj_data: dict) -> T:
        """Create a new record (without committing)."""
        obj = self.model(**obj_data)
        self.session.add(obj)
        await self.session.flush()
        return obj

    async def update(
        self, obj_id: Any,  update_data: dict, joins: Optional[list] = None,
    ) -> Optional[T]:
        """Update a record by ID (without committing)."""
        obj = await self.get_by_id(obj_id, joins)
        if not obj:
            return None

        for key, value in update_data.items():
            if isinstance(value, dict):
                related_obj = getattr(obj, key, None)
                if related_obj:
                    for sub_key, sub_value in value.items():
                        if sub_value:
                            setattr(related_obj, sub_key, sub_value)
                else:
                    raise ValueError(
                        f"Related object '{key}' not found on {obj.__class__.__name__}"
                    )
            else:
                setattr(obj, key, value)

        await self.session.flush()
        return obj

    async def delete(self, obj_id: Any) -> bool:
        """Delete a record by ID (without committing)."""
        obj = await self.get_by_id(obj_id)
        if not obj:
            return False

        await self.session.delete(obj)
        await self.session.flush()
        return True

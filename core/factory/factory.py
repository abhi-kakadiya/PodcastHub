from functools import partial

from fastapi import Depends

# Import controllers, models, and repositories
#

from core.database import get_session


class Factory:
    """
    This is the factory container that will instantiate all the controllers and
    repositories which can be accessed by the rest of the application.
    """

    # Repositories
    #

    # Controllers get methods

def get_factory(db_session=Depends(get_session)) -> Factory:
    return Factory(db_session=db_session)
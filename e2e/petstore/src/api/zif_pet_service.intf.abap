"! Service contract for managing pets.
"!
"! Implementations must persist pet data and raise on conflicts.
INTERFACE zif_pet_service
  PUBLIC.

  TYPES ty_pet_id TYPE sysuuid_x.

  METHODS:
    get_pet
      IMPORTING
        iv_pet_id      TYPE sysuuid_x
      RETURNING
        VALUE(rs_pet)  TYPE ty_pet
      RAISING
        cx_static_check.

ENDINTERFACE.
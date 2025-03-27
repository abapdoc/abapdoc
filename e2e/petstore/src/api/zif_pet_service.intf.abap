INTERFACE zif_pet_service
  PUBLIC.

  TYPES:
    BEGIN OF ty_pet,
      pet_id TYPE sysuuid_x,
      name   TYPE text40,
      type   TYPE text20,
    END OF ty_pet.

  TYPES:
    ty_pets TYPE STANDARD TABLE OF ty_pet WITH KEY pet_id.

  METHODS:
    get_pet
      IMPORTING
        iv_pet_id      TYPE sysuuid_x
      RETURNING
        VALUE(rs_pet)  TYPE ty_pet
      RAISING
        cx_static_check,

    get_all_pets
      RETURNING
        VALUE(rt_pets) TYPE ty_pets
      RAISING
        cx_static_check,

    add_pet
      IMPORTING
        is_pet         TYPE ty_pet
      RAISING
        cx_static_check,

    update_pet
      IMPORTING
        is_pet         TYPE ty_pet
      RAISING
        cx_static_check,

    delete_pet
      IMPORTING
        iv_pet_id      TYPE sysuuid_x
      RAISING
        cx_static_check.

ENDINTERFACE.

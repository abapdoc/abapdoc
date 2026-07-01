CLASS zcl_pet_service DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES zif_pet_service.

ENDCLASS.

CLASS zcl_pet_service IMPLEMENTATION.

  "! Read a single pet by id.
  "!
  "! Throws when no row matches.
  "!
  "! @parameter iv_pet_id      the primary key
  "! @return                    the pet row
  "! @raising cx_sy_itab_line_not_found
  METHOD zif_pet_service~get_pet.
    SELECT SINGLE *
      FROM ztpet
      INTO CORRESPONDING FIELDS OF rs_pet
      WHERE pet_id = iv_pet_id.

    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE cx_sy_itab_line_not_found.
    ENDIF.
  ENDMETHOD.

  "! Return every pet in the table.
  "!
  "! @parameter et_pets | the resolved pet list |
  METHOD zif_pet_service~get_all_pets.
    SELECT *
      FROM ztpet
      INTO CORRESPONDING FIELDS OF TABLE et_pets.
  ENDMETHOD.

  "! Add a new pet.
  "!
  "! @parameter is_pet        the new pet row
  "! @raising   cx_sy_open_sql_db
  METHOD zif_pet_service~add_pet.
    INSERT ztpet FROM is_pet.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE cx_sy_open_sql_db.
    ENDIF.
  ENDMETHOD.

  "! Update an existing pet.
  "!
  "! @parameter is_pet        the updated pet row
  "! @raising   cx_sy_open_sql_db
  METHOD zif_pet_service~update_pet.
    UPDATE ztpet FROM is_pet.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE cx_sy_open_sql_db.
    ENDIF.
  ENDMETHOD.

  "! Delete a pet by id.
  "!
  "! @parameter iv_pet_id      the primary key
  "! @raising   cx_sy_open_sql_db
  METHOD zif_pet_service~delete_pet.
    DELETE FROM ztpet WHERE pet_id = iv_pet_id.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE cx_sy_open_sql_db.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
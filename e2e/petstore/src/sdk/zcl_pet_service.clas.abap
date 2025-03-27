CLASS zcl_pet_service DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES zif_pet_service.

  PROTECTED SECTION.
  PRIVATE SECTION.

ENDCLASS.

CLASS zcl_pet_service IMPLEMENTATION.

  METHOD zif_pet_service~get_pet.
    SELECT SINGLE *
      FROM ztpet
      INTO CORRESPONDING FIELDS OF rs_pet
      WHERE pet_id = iv_pet_id.

    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE cx_sy_itab_line_not_found.
    ENDIF.
  ENDMETHOD.

  METHOD zif_pet_service~get_all_pets.
    SELECT *
      FROM ztpet
      INTO CORRESPONDING FIELDS OF TABLE rt_pets.
  ENDMETHOD.

  METHOD zif_pet_service~add_pet.
    INSERT ztpet FROM is_pet.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE cx_sy_open_sql_db.
    ENDIF.
  ENDMETHOD.

  METHOD zif_pet_service~update_pet.
    UPDATE ztpet FROM is_pet.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE cx_sy_open_sql_db.
    ENDIF.
  ENDMETHOD.

  METHOD zif_pet_service~delete_pet.
    DELETE FROM ztpet WHERE pet_id = iv_pet_id.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE cx_sy_open_sql_db.
    ENDIF.
  ENDMETHOD.

ENDCLASS.

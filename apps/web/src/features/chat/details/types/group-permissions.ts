/** What the person looking may do in a group. */
export interface GroupPermissions {
	isAdmin: boolean;
	/** May rename the group and change its photo — admins, or everyone when the group allows it. */
	canEditInfo: boolean;
	/** May add people — admins, or everyone when the group allows it. */
	canInvite: boolean;
}

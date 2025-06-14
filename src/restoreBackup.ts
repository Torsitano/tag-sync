import { CreateTagsCommand, EC2Client, Tag } from '@aws-sdk/client-ec2'
import * as fs from 'fs'

// You must change the name of the backup file in the constant RESTORE_BACKUP_FILE to the one you want to restore
export const RESTORE_BACKUP_FILE = 'instance-tags-backup-2025-06-14T13:23:35.031Z.json'
export const DRY_RUN = false

export function restoreInstanceTagsFromBackup( ec2Client: EC2Client ) {
    if ( !fs.existsSync( RESTORE_BACKUP_FILE ) ) {
        console.error( `Backup file ${RESTORE_BACKUP_FILE} does not exist` )
        return
    }

    const backupFileContent = fs.readFileSync( RESTORE_BACKUP_FILE, 'utf-8' )
    const instanceTagsBackup: Record<string, Record<string, string>> = JSON.parse( backupFileContent )

    for ( const instanceId in instanceTagsBackup ) {
        const tagsObj = instanceTagsBackup[ instanceId ]
        const tags: Tag[] = Object.entries( tagsObj ).map( ( [ key, value ] ) => ( { Key: key, Value: value } ) )

        console.log( `Restoring tags for instance '${instanceId}'` )
        console.dir( tags )
        if ( DRY_RUN ) {
            console.log( `DRY RUN: Would restore tags for Instance '${instanceId}:` )
            continue
        }
        const command = new CreateTagsCommand( {
            Resources: [ instanceId ],
            Tags: tags,
        } )
        ec2Client.send( command )
        console.log( `Tags restored for instance '${instanceId}'` )
    }
}

restoreInstanceTagsFromBackup( new EC2Client( { region: 'us-east-1' } ) )